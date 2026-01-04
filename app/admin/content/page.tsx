"use client";

import { NoteIcon, PlusIcon, MagnifyingGlassIcon, PencilSimpleIcon, TrashIcon, EyeIcon } from "@phosphor-icons/react";
import Image from "next/image";

export default function AdminContentPage() {
  const articles = [
    {
      id: 1,
      title: "Conseils pour bien préparer votre visite immobilière",
      author: "Salif Tankoano",
      date: "02 Jan 2026",
      status: "Publié",
      category: "Conseils",
      image: "/hero-bg.jpg"
    },
    {
      id: 2,
      title: "Le marché de l'immobilier à Ouagadougou en 2026",
      author: "Admin Roogo",
      date: "28 Dec 2025",
      status: "Brouillon",
      category: "Marché",
      image: "/hero-bg.jpg"
    }
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Gestion du Contenu</h1>
          <p className="text-neutral-500 mt-1">Publiez des articles, des guides et des actualités.</p>
        </div>
        
        <button className="flex items-center justify-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all active:scale-95">
          <PlusIcon size={20} weight="bold" />
          Nouvel Article
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-100 gap-8">
        {["Tous les articles", "Publiés", "Brouillons", "Corbeille"].map((tab, i) => (
          <button 
            key={tab} 
            className={`pb-4 text-sm font-bold transition-all relative
              ${i === 0 ? 'text-primary' : 'text-neutral-400 hover:text-neutral-600'}
            `}
          >
            {tab}
            {i === 0 && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
          </button>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-grow">
          <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" size={20} />
          <input
            type="text"
            placeholder="Rechercher un article..."
            className="w-full pl-12 pr-4 py-3 bg-white rounded-2xl border border-neutral-100 shadow-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
          />
        </div>
        <select className="px-4 py-3 bg-white rounded-2xl border border-neutral-100 shadow-sm text-sm font-bold text-neutral-600 outline-none">
          <option>Toutes les catégories</option>
          <option>Conseils</option>
          <option>Marché</option>
          <option>Actualités</option>
        </select>
      </div>

      {/* Content List */}
      <div className="bg-white rounded-[40px] border border-neutral-100 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-neutral-50/50 border-b border-neutral-100">
            <tr>
              <th className="px-8 py-5 text-xs font-bold text-neutral-400 uppercase tracking-wider">Article</th>
              <th className="px-8 py-5 text-xs font-bold text-neutral-400 uppercase tracking-wider">Catégorie</th>
              <th className="px-8 py-5 text-xs font-bold text-neutral-400 uppercase tracking-wider">Statut</th>
              <th className="px-8 py-5 text-xs font-bold text-neutral-400 uppercase tracking-wider">Date</th>
              <th className="px-8 py-5 text-xs font-bold text-neutral-400 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50">
            {articles.map(article => (
              <tr key={article.id} className="hover:bg-neutral-50/30 transition-colors">
                <td className="px-8 py-5">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-neutral-100">
                      <Image src={article.image} alt="" width={48} height={48} className="object-cover" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-neutral-900 leading-tight mb-1">{article.title}</h4>
                      <p className="text-xs text-neutral-400 font-medium">Par {article.author}</p>
                    </div>
                  </div>
                </td>
                <td className="px-8 py-5">
                  <span className="text-sm font-bold text-neutral-600 bg-neutral-100 px-3 py-1 rounded-lg">
                    {article.category}
                  </span>
                </td>
                <td className="px-8 py-5">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider
                    ${article.status === 'Publié' ? 'bg-green-50 text-green-600' : 'bg-neutral-50 text-neutral-400'}
                  `}>
                    {article.status}
                  </span>
                </td>
                <td className="px-8 py-5">
                  <span className="text-sm text-neutral-500 font-medium">{article.date}</span>
                </td>
                <td className="px-8 py-5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button className="p-2 hover:bg-white hover:shadow-sm rounded-lg text-neutral-400 hover:text-primary transition-all">
                      <EyeIcon size={18} weight="bold" />
                    </button>
                    <button className="p-2 hover:bg-white hover:shadow-sm rounded-lg text-neutral-400 hover:text-primary transition-all">
                      <PencilSimpleIcon size={18} weight="bold" />
                    </button>
                    <button className="p-2 hover:bg-white hover:shadow-sm rounded-lg text-neutral-400 hover:text-red-500 transition-all">
                      <TrashIcon size={18} weight="bold" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {articles.length === 0 && (
        <div className="text-center py-20 bg-white rounded-[40px] border border-neutral-100">
          <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <NoteIcon size={32} className="text-neutral-300" />
          </div>
          <h3 className="text-lg font-bold text-neutral-900">Aucun article</h3>
          <p className="text-neutral-500 mt-2">Commencez à publier du contenu pour vos utilisateurs.</p>
        </div>
      )}
    </div>
  );
}

