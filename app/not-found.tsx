import React from 'react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-950 text-white p-6">
      <h2 className="text-2xl font-bold mb-2">404 - Strona nie znaleziona</h2>
      <p className="text-neutral-400 text-sm mb-6">
        Podany zasób lub endpoint nie istnieje.
      </p>
      <Link
        href="/"
        className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg transition-colors"
      >
        Powrót do panelu głównego
      </Link>
    </div>
  );
}
