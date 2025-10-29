
import React from 'react';
import { Link } from 'react-router-dom';

const NotFoundPage: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center text-center h-[calc(100vh-15rem)]">
      <h1 className="text-6xl font-bold text-sky-400">404</h1>
      <p className="text-2xl mt-4 mb-8 text-slate-300">Page Not Found</p>
      <Link to="/" className="bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 px-6 rounded-lg transition-colors">
        Go Home
      </Link>
    </div>
  );
};

export default NotFoundPage;
