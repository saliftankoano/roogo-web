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
    const module = { exports: {} };
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
    new Function('require', 'module', 'exports', compiled)(mockedRequire, module, module.exports);
    return module.exports;
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

test('primary destinations and account slot dimensions stay stable through hydration and every role', () => {
  const states = [loading, guest, ...['renter', 'owner', 'agent', 'staff', 'founder'].map(signedIn)];
  const rendered = states.map(state => render(state));
  const primary = nav(rendered[0], 'Navigation principale');
  assert.ok(primary.includes('/visites-3d'));
  for (const html of rendered) {
    assert.equal(nav(html, 'Navigation principale'), primary);
    assert.equal(html.match(/data-nav-auth-slot="true" class="([^"]+)"/)?.[1],
      'flex h-10 w-36 shrink-0 items-center justify-end sm:w-60');
    assert.match(html, /aria-current="page"/);
  }
});

test('loading never flashes sign-in controls; public links also remain in mobile navigation', () => {
  for (const state of [loading, guest, signedIn('owner')]) {
    const html = render(state, true);
    assert.match(html, /aria-label="Navigation mobile"/);
    for (const href of ['/', '/proprietes', '/visites-3d', '/a-propos', '/carrieres', '/nous-contacter']) {
      assert.ok(html.includes(`href="${href}"`));
    }
  }
  assert.doesNotMatch(render(loading, true), /href="\/(connexion|inscription)"/);
  assert.match(render(guest), /href="\/inscription"/);
});

test('account menu retains role destinations without replacing the public nav', () => {
  assert.match(nav(render(signedIn('owner')), 'Navigation du compte'), /Mes Biens/);
  assert.match(nav(render(signedIn('agent')), 'Navigation du compte'), /Mes Biens/);
  assert.doesNotMatch(nav(render(signedIn('renter')), 'Navigation du compte'), /Mes Biens/);
  assert.match(nav(render(signedIn('renter')), 'Navigation du compte'), /Parrainage/);
  assert.match(nav(render(signedIn('staff')), 'Navigation du compte'), /href="\/admin/);
  assert.match(nav(render(signedIn('founder')), 'Navigation du compte'), /href="\/admin/);
  assert.equal(nav(render(guest), 'Navigation du compte'), undefined);
});

test('Escape restores focus from mobile links but does not steal focus outside the menu', () => {
  for (const focusInside of [true, false]) {
    const effects = [];
    const listeners = new Map();
    let focused = false;
    let open = true;
    const link = {};
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
      activeElement: focusInside ? link : {},
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
