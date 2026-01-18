'use client';
import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

export default function StagingPage() {
    const [products, setProducts] = useState([]);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [loading, setLoading] = useState(false);
    const [actionStatus, setActionStatus] = useState('');

    useEffect(() => {
        fetchProducts(page);
    }, [page]);

    const fetchProducts = async (p) => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}/api/products?page=${p}`);
            setProducts(res.data.products);
            setPages(res.data.pages);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const triggerAction = async (endpoint, label) => {
        if (!confirm(`Are you sure you want to ${label}?`)) return;
        setActionStatus(`Starting ${label}...`);
        try {
            await axios.post(`${API_URL}/api/products/${endpoint}`);
            setActionStatus(`${label} started successfully! Check logs.`);
            setTimeout(() => {
                fetchProducts(page); // Refresh list
            }, 2000);
        } catch (err) {
            setActionStatus(`Failed to start ${label}.`);
            console.error(err);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Product Staging</h1>
                    <p className="text-gray-500">Review and approve products before syncing to Shopify.</p>
                </div>
                <div className="space-x-4">
                    <button
                        onClick={() => triggerAction('ingest', 'Ingest from AQ')}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                    >
                        1. Ingest from AQ
                    </button>
                    <button
                        onClick={() => triggerAction('pricing/apply', 'Apply Pricing Rules')}
                        className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700"
                    >
                        2. Apply Rules
                    </button>
                    <button
                        onClick={() => triggerAction('sync', 'Sync to Shopify')}
                        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                    >
                        3. Sync to Shopify
                    </button>
                </div>
            </header>

            {actionStatus && (
                <div className="mb-4 p-4 bg-white border rounded shadow text-center text-sm font-medium text-blue-600">
                    {actionStatus}
                </div>
            )}

            <div className="bg-white shadow rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Manufacturer</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">List Price</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Final Price</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {products.map((p: any) => (
                            <tr key={p._id}>
                                <td className="px-6 py-4">
                                    <div className="flex items-center">
                                        {p.images && p.images[0] && (
                                            <img className="h-10 w-10 rounded mr-3 object-cover" src={p.images[0].src || 'data:image/svg+xml;base64,' + p.images[0].attachment} alt="" />
                                        )}
                                        <div>
                                            <div className="text-sm font-medium text-gray-900">{p.title}</div>
                                            <div className="text-sm text-gray-500">{p.aqModelNumber}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500">{p.aqMfrName}</td>
                                <td className="px-6 py-4 text-sm text-gray-500">${p.listPrice?.toFixed(2)}</td>
                                <td className="px-6 py-4 text-sm font-bold text-gray-900">${p.finalPrice?.toFixed(2)}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${p.status === 'synced' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                        }`}>
                                        {p.status}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="mt-4 flex justify-between items-center px-4">
                <button
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                    className="px-4 py-2 border rounded disabled:opacity-50"
                >
                    Previous
                </button>
                <span className="text-sm text-gray-600">Page {page} of {pages}</span>
                <button
                    disabled={page === pages}
                    onClick={() => setPage(p => p + 1)}
                    className="px-4 py-2 border rounded disabled:opacity-50"
                >
                    Next
                </button>
            </div>
        </div>
    );
}
