'use client';
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

// Image Upload Modal Component
function ImageUploadModal({ 
    isOpen, 
    product, 
    onClose, 
    onSuccess 
}: { 
    isOpen: boolean; 
    product: any; 
    onClose: () => void; 
    onSuccess: () => void;
}) {
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Reset state when modal opens/closes
    useEffect(() => {
        if (!isOpen) {
            setPreviews([]);
            setSelectedFiles([]);
            setError(null);
            setUploading(false);
        }
    }, [isOpen]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const files = Array.from(e.target.files);
            const validFiles: File[] = [];
            const newPreviews: string[] = [];
            
            // Reset previous selection
            previews.forEach(url => URL.revokeObjectURL(url));

            // Validate and process files
            for (const file of files) {
                const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
                if (!validTypes.includes(file.type)) {
                    setError(`File ${file.name} is not a valid image type`);
                    continue;
                }
                if (file.size > 10 * 1024 * 1024) {
                    setError(`File ${file.name} is too large (max 10MB)`);
                    continue;
                }
                validFiles.push(file);
                newPreviews.push(URL.createObjectURL(file));
            }

            if (validFiles.length > 0) {
                setSelectedFiles(validFiles);
                setPreviews(newPreviews);
                setError(null);
            }
        }
    };

    const handleUpload = async () => {
        if (selectedFiles.length === 0 || !product) return;

        setUploading(true);
        setError(null);

        const formData = new FormData();
        selectedFiles.forEach((file) => {
            formData.append('images', file);
        });

        try {
            await axios.post(
                `${API_URL}/api/products/${product._id}/image`,
                formData,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data'
                    }
                }
            );

            onSuccess();
            onClose();
        } catch (err: any) {
            console.error('Upload error:', err);
            setError(err.response?.data?.details || err.message || 'Failed to upload images');
        } finally {
            setUploading(false);
        }
    };

    // Cleanup previews on unmount
    useEffect(() => {
        return () => {
            previews.forEach(url => URL.revokeObjectURL(url));
        };
    }, [previews]);

    if (!isOpen || !product) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
                onClick={onClose}
            />
            
            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-scale-in max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Add Images</h2>
                        <p className="text-sm text-gray-500 mt-0.5 truncate max-w-[280px]">{product.title}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5">
                    {/* Current Images */}
                    <div className="mb-6">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Current Images</label>
                        {product.images && product.images.length > 0 ? (
                            <div className="grid grid-cols-4 gap-2">
                                {product.images.map((img: any, idx: number) => (
                                    <div key={idx} className="aspect-square rounded-lg border border-gray-200 overflow-hidden bg-gray-50 relative group">
                                        <img 
                                            src={img.src || 'data:image/svg+xml;base64,' + img.attachment} 
                                            alt="" 
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-sm text-gray-400 italic">No images currently set.</div>
                        )}
                    </div>

                    {/* Upload Area */}
                    <div className="mb-4">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">New Images</label>
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept="image/jpeg,image/png,image/gif,image/webp"
                            onChange={handleFileSelect}
                            className="hidden"
                        />
                        
                        {previews.length > 0 ? (
                            <div className="mb-4">
                                <div className="grid grid-cols-3 gap-3 mb-3">
                                    {previews.map((preview, idx) => (
                                        <div key={idx} className="relative aspect-square">
                                            <img src={preview} alt={`Preview ${idx}`} className="w-full h-full object-cover rounded-lg border border-indigo-200 bg-gray-50" />
                                        </div>
                                    ))}
                                </div>
                                <div className="flex justify-end">
                                    <button
                                        onClick={() => { setPreviews([]); setSelectedFiles([]); }}
                                        className="text-xs text-red-600 hover:text-red-700 font-medium"
                                    >
                                        Clear Selection
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full h-32 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-all group"
                            >
                                <div className="p-3 bg-gray-50 rounded-full group-hover:bg-white transition-colors mb-2">
                                    <svg className="w-6 h-6 text-gray-400 group-hover:text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <span className="text-sm font-medium text-gray-600 group-hover:text-indigo-600">Click to select images</span>
                                <span className="text-xs text-gray-400 mt-1">JPEG, PNG, WEBP up to 10MB</span>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 mt-6">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleUpload}
                            disabled={selectedFiles.length === 0 || uploading}
                            className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadowed-button"
                        >
                            {uploading ? (
                                <>
                                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    Uploading {selectedFiles.length} {selectedFiles.length === 1 ? 'Image' : 'Images'}...
                                </>
                            ) : (
                                'Upload Images'
                            )}
                        </button>
                    </div>
                    
                    {error && (
                        <div className="mt-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center gap-2 animate-shake">
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {error}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function StagingPage() {
    const [products, setProducts] = useState([]);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [loading, setLoading] = useState(false);
    const [actionStatus, setActionStatus] = useState('');
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState('');
    
    // Image upload modal state
    const [imageModalOpen, setImageModalOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<any>(null);

    useEffect(() => {
        fetchProducts(page);
    }, [page]);

    const fetchProducts = async (p: number) => {
        setLoading(true);
        setError('');
        try {
            const res = await axios.get(`${API_URL}/api/products?page=${p}`);
            setProducts(res.data.products);
            setPages(res.data.pages);
        } catch (err: any) {
            console.error(err);
            setError(err.message + (err.response ? `: ${JSON.stringify(err.response.data)}` : '') + ` (URL: ${API_URL})`);
        } finally {
            setLoading(false);
        }
    };

    const triggerAction = async (endpoint: string, label: string) => {
        if (!confirm(`Are you sure you want to ${label}?`)) return;
        setActionLoading(endpoint);
        setActionStatus(`Starting ${label}...`);
        try {
            await axios.post(`${API_URL}/api/products/${endpoint}`);
            setActionStatus(`${label} started successfully!`);
            setTimeout(() => {
                fetchProducts(page);
                setActionStatus('');
            }, 3000);
        } catch (err) {
            setActionStatus(`Failed to start ${label}.`);
            console.error(err);
        } finally {
            setActionLoading(null);
        }
    };

    const handleChangeImage = (product: any) => {
        setSelectedProduct(product);
        setImageModalOpen(true);
    };

    const handleImageUploadSuccess = () => {
        setActionStatus('Image uploaded successfully!');
        fetchProducts(page);
        setTimeout(() => setActionStatus(''), 3000);
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6 md:p-8">
            {/* Header */}
            <header className="mb-8">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                            </Link>
                            <h1 className="text-3xl font-black tracking-tight text-gray-900">Product Staging</h1>
                        </div>
                        <p className="text-gray-500">Review and approve products before syncing to Shopify.</p>
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={() => triggerAction('ingest', 'Ingest from AQ')}
                            disabled={actionLoading !== null}
                            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {actionLoading === 'ingest' ? (
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            ) : (
                                <span className="w-5 h-5 flex items-center justify-center bg-indigo-500 rounded text-xs font-bold">1</span>
                            )}
                            Ingest
                        </button>
                        <button
                            onClick={() => triggerAction('pricing/apply', 'Apply Pricing Rules')}
                            disabled={actionLoading !== null}
                            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {actionLoading === 'pricing/apply' ? (
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            ) : (
                                <span className="w-5 h-5 flex items-center justify-center bg-indigo-500 rounded text-xs font-bold">2</span>
                            )}
                            Apply Rules
                        </button>
                        <button
                            onClick={() => triggerAction('sync', 'Sync to Shopify')}
                            disabled={actionLoading !== null}
                            className="inline-flex items-center gap-2 bg-gray-900 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {actionLoading === 'sync' ? (
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            ) : (
                                <span className="w-5 h-5 flex items-center justify-center bg-gray-700 rounded text-xs font-bold">3</span>
                            )}
                            Sync to Shopify
                        </button>
                    </div>
                </div>
            </header>

            {/* Status Messages */}
            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-start gap-3">
                    <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <div>
                        <strong className="font-semibold">Error:</strong> {error}
                    </div>
                </div>
            )}

            {actionStatus && (
                <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl flex items-center justify-center gap-2 font-medium animate-fade-in">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    {actionStatus}
                </div>
            )}

            {/* Products Table */}
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Product</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Manufacturer</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">List Price</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Final Price</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                [...Array(5)].map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-gray-200 rounded"></div>
                                                <div>
                                                    <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
                                                    <div className="h-3 bg-gray-200 rounded w-24"></div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5"><div className="h-4 bg-gray-200 rounded w-24"></div></td>
                                        <td className="px-6 py-5"><div className="h-4 bg-gray-200 rounded w-16"></div></td>
                                        <td className="px-6 py-5"><div className="h-4 bg-gray-200 rounded w-16"></div></td>
                                        <td className="px-6 py-5"><div className="h-6 bg-gray-200 rounded w-20"></div></td>
                                        <td className="px-6 py-5"><div className="h-8 bg-gray-200 rounded w-24 ml-auto"></div></td>
                                    </tr>
                                ))
                            ) : products.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-16 text-center">
                                        <div className="text-gray-400">
                                            <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                                            </svg>
                                            <p className="font-medium">No products staged yet</p>
                                            <p className="text-sm mt-1">Click "Ingest" to import products from AutoQuotes</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                products.map((p: any) => (
                                    <tr key={p._id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                {p.images && p.images[0] ? (
                                                    <img 
                                                        className="h-12 w-12 rounded-lg object-cover border border-gray-200" 
                                                        src={p.images[0].src || 'data:image/svg+xml;base64,' + p.images[0].attachment} 
                                                        alt="" 
                                                    />
                                                ) : (
                                                    <div className="h-12 w-12 rounded-lg bg-gray-100 flex items-center justify-center">
                                                        <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                        </svg>
                                                    </div>
                                                )}
                                                <div>
                                                    <div className="font-semibold text-gray-900">{p.title}</div>
                                                    <div className="text-sm text-gray-500 font-mono">{p.aqModelNumber}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600">{p.aqMfrName}</td>
                                        <td className="px-6 py-4 text-sm text-gray-500">${p.listPrice?.toFixed(2)}</td>
                                        <td className="px-6 py-4 text-sm font-bold text-gray-900">${p.finalPrice?.toFixed(2)}</td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                                                p.status === 'synced' 
                                                    ? 'bg-emerald-100 text-emerald-700' 
                                                    : p.status === 'staged'
                                                    ? 'bg-indigo-100 text-indigo-700'
                                                    : p.status === 'error'
                                                    ? 'bg-red-100 text-red-700'
                                                    : 'bg-gray-100 text-gray-600'
                                            }`}>
                                                {p.status === 'synced' && (
                                                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                )}
                                                {p.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => handleChangeImage(p)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                                Change Image
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50">
                    <button
                        disabled={page === 1}
                        onClick={() => setPage(p => p - 1)}
                        className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Previous
                    </button>
                    <span className="text-sm text-gray-600">
                        Page <span className="font-semibold">{page}</span> of <span className="font-semibold">{pages}</span>
                    </span>
                    <button
                        disabled={page === pages}
                        onClick={() => setPage(p => p + 1)}
                        className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        Next
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Image Upload Modal */}
            <ImageUploadModal
                isOpen={imageModalOpen}
                product={selectedProduct}
                onClose={() => {
                    setImageModalOpen(false);
                    setSelectedProduct(null);
                }}
                onSuccess={handleImageUploadSuccess}
            />
        </div>
    );
}
