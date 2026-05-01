"use client";

import React, { useState, useEffect } from 'react';

interface CategoryRule {
    _id: string;
    vendor: string;
    productType: string;
    parentCategory: string;
    subCategory: string;
    childCategory: string;
}

export default function CategoryRulesPage() {
    const [rules, setRules] = useState<CategoryRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const [form, setForm] = useState({
        vendor: '',
        productType: '',
        parentCategory: '',
        subCategory: '',
        childCategory: ''
    });

    useEffect(() => {
        fetchRules();
    }, []);

    const fetchRules = async () => {
        setLoading(true);
        try {
            // Note: Update to use NEXT_PUBLIC_API_URL or similar if deployed elsewhere
            const res = await fetch('http://localhost:5000/api/categories/rules');
            if (!res.ok) throw new Error('Failed to fetch rules');
            const data = await res.json();
            setRules(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');
        try {
            const res = await fetch('http://localhost:5000/api/categories/rules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form)
            });
            if (!res.ok) throw new Error('Failed to save rule');
            
            setSuccessMsg('Rule saved successfully!');
            setForm({
                vendor: '',
                productType: '',
                parentCategory: '',
                subCategory: '',
                childCategory: ''
            });
            fetchRules();
            
            setTimeout(() => setSuccessMsg(''), 3000);
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this rule?')) return;
        try {
            const res = await fetch(`http://localhost:5000/api/categories/rules/${id}`, {
                method: 'DELETE'
            });
            if (!res.ok) throw new Error('Failed to delete rule');
            fetchRules();
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-900">Category Rules Mapping</h1>
            </div>

            {error && <div className="bg-red-50 text-red-600 p-4 rounded-md text-sm">{error}</div>}
            {successMsg && <div className="bg-green-50 text-green-600 p-4 rounded-md text-sm">{successMsg}</div>}

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h2 className="text-lg font-semibold mb-4">Add New Mapping Rule</h2>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Vendor (AQ Mfr)</label>
                        <input required type="text" name="vendor" value={form.vendor} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md p-2 text-sm text-black" placeholder="e.g. True Manufacturing" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Product Type</label>
                        <input required type="text" name="productType" value={form.productType} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md p-2 text-sm text-black" placeholder="e.g. Refrigerators" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Parent Category</label>
                        <input required type="text" name="parentCategory" value={form.parentCategory} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md p-2 text-sm text-black" placeholder="e.g. Refrigeration" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Sub Category</label>
                        <input required type="text" name="subCategory" value={form.subCategory} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md p-2 text-sm text-black" placeholder="e.g. Reach-In" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Child Category</label>
                        <div className="flex gap-2">
                            <input required type="text" name="childCategory" value={form.childCategory} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md p-2 text-sm text-black" placeholder="e.g. 2-Door" />
                            <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700">Save</button>
                        </div>
                    </div>
                </form>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-left text-sm text-black">
                        <thead className="bg-gray-50 text-gray-500">
                            <tr>
                                <th className="px-6 py-4 font-medium uppercase tracking-wider">Vendor</th>
                                <th className="px-6 py-4 font-medium uppercase tracking-wider">Product Type</th>
                                <th className="px-6 py-4 font-medium uppercase tracking-wider">Parent Category</th>
                                <th className="px-6 py-4 font-medium uppercase tracking-wider">Sub Category</th>
                                <th className="px-6 py-4 font-medium uppercase tracking-wider">Child Category</th>
                                <th className="px-6 py-4 font-medium uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">Loading rules...</td>
                                </tr>
                            ) : rules.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">No category mapping rules defined.</td>
                                </tr>
                            ) : rules.map(rule => (
                                <tr key={rule._id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 font-medium text-gray-900">{rule.vendor}</td>
                                    <td className="px-6 py-4 text-gray-600">{rule.productType}</td>
                                    <td className="px-6 py-4 text-gray-600"><span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs">{rule.parentCategory}</span></td>
                                    <td className="px-6 py-4 text-gray-600"><span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs">{rule.subCategory}</span></td>
                                    <td className="px-6 py-4 text-gray-600"><span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs">{rule.childCategory}</span></td>
                                    <td className="px-6 py-4 text-right">
                                        <button onClick={() => handleDelete(rule._id)} className="text-red-500 hover:text-red-700 text-sm font-medium">Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
