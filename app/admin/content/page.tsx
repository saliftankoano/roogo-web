"use client";

import { Note, Plus, MagnifyingGlass, PencilSimple, Trash, Eye } from "@phosphor-icons/react";
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
          <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">Gestion du Contenu</h1>
          <p className="text-neutral-500 font-medium mt-1">Publiez des articles, des guides et des actualités.</p>
        </div>
        
        <button className="flex items-center justify-center gap-2 bg-primary text-white px-8 py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all active:scale-95 text-sm uppercase tracking-wider">
          <Plus size={20} weight="bold" />
          Nouvel Article
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-100 gap-8 overflow-x-auto no-scrollbar">
        {["Tous les articles", "Publiés", "Brouillons", "Corbeille"].map((tab, i) => (
          <button 
            key={tab} 
            className={`pb-4 text-sm font-bold transition-all relative whitespace-nowrap
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
          <MagnifyingGlass className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-400" size={20} weight="bold" />
          <input
            type="text"
            placeholder="Rechercher un article..."
            className="w-full pl-12 pr-6 py-4 bg-white rounded-full border border-neutral-100 shadow-sm focus:ring-4 focus:ring-primary/5 focus:border-primary/20 outline-none transition-all text-[15px] font-medium"
          />
        </div>
        <select className="px-6 py-4 bg-white rounded-full border border-neutral-100 shadow-sm text-[15px] font-bold text-neutral-600 outline-none cursor-pointer hover:border-primary/20 transition-all appearance-none pr-12 relative">
          <option>Toutes les catégories</option>
          <option>Conseils</option>
          <option>Marché</option>
          <option>Actualités</option>
        </select>
      </div>

      {/* Content List */}
      <div className="bg-white rounded-[40px] border border-neutral-100 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-left min-w-[800px]">
          <thead className="bg-neutral-50/50 border-b border-neutral-100">
            <tr>
              <th className="px-8 py-6 text-xs font-bold text-neutral-400 uppercase tracking-widest">Article</th>
              <th className="px-8 py-6 text-xs font-bold text-neutral-400 uppercase tracking-widest">Catégorie</th>
              <th className="px-8 py-6 text-xs font-bold text-neutral-400 uppercase tracking-widest">Statut</th>
              <th className="px-8 py-6 text-xs font-bold text-neutral-400 uppercase tracking-widest">Date</th>
              <th className="px-8 py-6 text-xs font-bold text-neutral-400 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50">
            {articles.map(article => (
              <tr key={article.id} className="hover:bg-neutral-50/30 transition-colors group">
                <td className="px-8 py-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl overflow-hidden shrink-0 border border-neutral-100 shadow-sm">
                      <Image src={article.image} alt="" width={56} height={56} className="object-cover group-hover:scale-110 transition-transform duration-500" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-neutral-900 leading-tight mb-1 group-hover:text-primary transition-colors">{article.title}</h4>
                      <p className="text-[11px] text-neutral-400 font-bold uppercase tracking-wider">Par {article.author}</p>
                    </div>
                  </div>
                </td>
                <td className="px-8 py-6">
                  <span className="text-xs font-bold text-neutral-500 bg-neutral-100 px-3 py-1.5 rounded-lg border border-neutral-200/50 uppercase tracking-wider">
                    {article.category}
                  </span>
                </td>
                <td className="px-8 py-6">
                  <span className={`text-[10px] font-bold px-3 py-1.5 rounded-lg uppercase tracking-widest border
                    ${article.status === 'Publié' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-neutral-50 text-neutral-400 border-neutral-200'}
                  `}>
                    {article.status}
                  </span>
                </td>
                <td className="px-8 py-6">
                  <span className="text-sm text-neutral-500 font-bold">{article.date}</span>
                </td>
                <td className="px-8 py-6 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button className="p-2.5 hover:bg-white hover:shadow-md rounded-xl text-neutral-400 hover:text-primary transition-all border border-transparent hover:border-neutral-100">
                      <Eye size={18} weight="bold" />
                    </button>
                    <button className="p-2.5 hover:bg-white hover:shadow-md rounded-xl text-neutral-400 hover:text-primary transition-all border border-transparent hover:border-neutral-100">
                      <PencilSimple size={18} weight="bold" />
                    </button>
                    <button className="p-2.5 hover:bg-white hover:shadow-md rounded-xl text-neutral-400 hover:text-red-500 transition-all border border-transparent hover:border-neutral-100">
                      <Trash size={18} weight="bold" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {articles.length === 0 && (
        <div className="text-center py-20 bg-white rounded-[40px] border border-neutral-100 shadow-sm">
          <div className="w-20 h-20 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Note size={40} className="text-neutral-300" />
          </div>
          <h3 className="text-xl font-bold text-neutral-900 mb-2">Aucun article</h3>
          <p className="text-neutral-500 max-w-xs mx-auto font-medium">Commencez à publier du contenu pour vos utilisateurs.</p>
        </div>
      )}
    </div>
  );
}

