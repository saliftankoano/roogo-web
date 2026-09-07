import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
// Render the real component with controlled Clerk hydration/role states.
// Stub provider/browser integrations only; navigation and role logic stay real.
function render(auth, mobileOpen = false, hooks = {}) {
  const icon = () => React.createElement('svg');
  const icons = new Proxy({}, { get: () => icon });
  function load(relative) {
    const filename = fileURLToPath(new URL(relative, import.meta.url));
    const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const loadedModule = { exports: {} };
    const mockedRequire = (name) => {
      if (name === 'react') return { ...React, useState: () => [mobileOpen, () => {}], ...hooks };
      if (name === '@clerk/nextjs') return {
        useUser: () => auth,
        UserButton: () => React.createElement('button', { 'aria-label': 'Profil' }),
      };
      if (name === 'next/navigation') return { usePathname: () => '/proprietes' };
      if (name === 'next/link') return { default: ({ children, ...props }) => React.createElement('a', props, children) };
      if (name === 'next/image') return { default: (props) => React.createElement('img', props) };
      if (name === '@phosphor-icons/react') return icons;
      if (name === '../lib/navigation/adminNav') return load('../lib/navigation/adminNav.ts');
      if (name === '../lib/utils') return { cn: (...values) => values.filter(Boolean).join(' ') };
      return require(name);
    };
    new Function('require', 'module', 'exports', compiled)(mockedRequire, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return renderToStaticMarkup(React.createElement(load('./Navbar.tsx').Navbar));
}

const signedIn = (role) => ({
  isLoaded: true, isSignedIn: true,
  user: { fullName: 'A very long name '.repeat(20), publicMetadata: { userType: role } },
});
const loading = { isLoaded: false, isSignedIn: undefined };
const guest = { isLoaded: true, isSignedIn: false };
const nav = (html, label) => html.match(new RegExp(`<nav aria-label="${label}"[^>]*>([\\s\\S]*?)</nav>`))?.[1];

test('loading reserves the same navigation and account dimensions without guest links', () => {
  const states = [loading, guest, ...['renter', 'owner', 'agent', 'staff', 'founder'].map(signedIn)];
  const rendered = states.map(state => render(state));
  const navClass = html => html.match(/aria-label="Navigation principale"[^>]*class="([^"]+)"/)?.[1];
  for (const html of rendered) {
    assert.equal(navClass(html), navClass(rendered[0]));
    assert.match(navClass(html), /w-\[700px\].*grid-cols-5/);
    assert.equal(html.match(/data-nav-auth-slot="true" class="([^"]+)"/)?.[1],
      'flex h-10 w-36 shrink-0 items-center justify-end sm:w-60');
  }
  assert.doesNotMatch(nav(render(loading), 'Navigation principale'), /href=/);
  assert.doesNotMatch(render(loading, true), /href="\/(connexion|inscription|proprietes)"/);
});

test('public roles have five tailored slots and the same destinations on mobile', () => {
  for (const state of [guest, signedIn('renter'), signedIn('owner'), signedIn('agent')]) {
    const html = render(state, true);
    const primary = nav(html, 'Navigation principale');
    const mobile = html.match(/aria-label="Navigation mobile"[^>]*>([\s\S]*?)<\/nav>/)[1];
    const hrefs = section => [...section.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
    assert.equal(hrefs(primary).length, 5);
    assert.deepEqual(hrefs(mobile).slice(0, 5), hrefs(primary));
    assert.deepEqual(hrefs(primary).slice(0, 2), ['/', '/proprietes']);
  }
  assert.match(nav(render(signedIn('owner')), 'Navigation principale'), /Mes biens/);
  assert.match(nav(render(signedIn('agent')), 'Navigation principale'), /Mes biens/);
  assert.match(nav(render(signedIn('renter')), 'Navigation principale'), /Visites 3D/);
  assert.match(nav(render(guest), 'Navigation principale'), /À propos/);
});

test('staff operations stay grouped and founder-only destinations stay restricted', () => {
  const staff = nav(render(signedIn('staff')), 'Navigation principale');
  const founder = nav(render(signedIn('founder')), 'Navigation principale');
  assert.equal((staff.match(/<details/g) || []).length, 4);
  for (const label of ['Messages', 'Opérations', 'Développement', 'Pilotage']) assert.ok(staff.includes(label));
  assert.doesNotMatch(staff, /href="\/admin\/(finances|parametres)"/);
  assert.match(founder, /href="\/admin\/finances"/);
  assert.match(founder, /href="\/admin\/parametres"/);
});

test('Escape restores focus from mobile links but does not steal focus outside the menu', () => {
  for (const focusInside of [true, false]) {
    const effects = [];
    const listeners = new Map();
    let focused = false;
    let open = true;
    const link = { closest: () => null };
    const refs = [
      { current: { focus: () => { focused = true; } } },
      { current: { contains: (element) => element === link } },
      { current: null },
    ];
    render(guest, true, {
      useRef: () => refs.shift(),
      useEffect: (effect) => effects.push(effect),
      useState: () => [open, (value) => { open = value; }],
    });
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { configurable: true, value: {
      activeElement: focusInside ? link : { closest: () => null },
      addEventListener: (name, listener) => listeners.set(name, listener),
      removeEventListener: (name) => listeners.delete(name),
    } });
    try {
      const cleanup = effects[1]();
      listeners.get('keydown')({ key: 'Tab' });
      assert.equal(open, true);
      listeners.get('keydown')({ key: 'Escape' });
      assert.equal(open, false);
      assert.equal(focused, focusInside);
      cleanup();
      assert.equal(listeners.size, 0);
    } finally {
      if (previous) Object.defineProperty(globalThis, 'document', previous);
      else delete globalThis.document;
    }
  }
});
