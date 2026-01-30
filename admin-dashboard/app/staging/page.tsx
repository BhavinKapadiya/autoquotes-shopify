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
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Reset state when modal opens/closes
    useEffect(() => {
        if (!isOpen) {
            setPreviews([]);
            setSelectedFiles([]);
            setError(null);
            setUploading(false);
            setLoadingId(null);
        }
    }, [isOpen]);

    const handleDeleteImage = async (imageUrl: string, imageId?: string) => {
        if (!confirm('Are you sure you want to delete this image?')) return;
        
        const trackingId = imageId || imageUrl;
        setLoadingId(trackingId);

        try {
            await axios.delete(`${API_URL}/api/products/${product._id}/images`, {
                data: { imageUrl, imageId }
            });
            onSuccess();
        } catch (err: any) {
            console.error(err);
            alert('Failed to delete image');
        } finally {
            setLoadingId(null);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const files = Array.from(e.target.files);
            const validFiles: File[] = [];
            const newPreviews: string[] = [];
            
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
                
                // Avoid duplicates based on name and size
                if (selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
                    continue;
                }

                validFiles.push(file);
                newPreviews.push(URL.createObjectURL(file));
            }

            if (validFiles.length > 0) {
                setSelectedFiles(prev => [...prev, ...validFiles]);
                setPreviews(prev => [...prev, ...newPreviews]);
                setError(null);
            }
            
            // Reset input so the same file can be selected again if needed (though we filter duplicates above)
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
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
                            <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                                {product.images.map((img: any, idx: number) => (
                                    <div key={idx} className="aspect-square rounded-lg border border-gray-200 overflow-hidden bg-gray-50 relative group">
                                        <img 
                                            src={img.src || 'data:image/svg+xml;base64,' + img.attachment} 
                                            alt="" 
                                            className="w-full h-full object-cover"
                                        />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                                            {loadingId === (img._id || img.src) ? (
                                                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                            ) : (
                                                <button 
                                                    onClick={() => handleDeleteImage(img.src, img._id)}
                                                    className="p-1.5 bg-white/90 rounded-full text-red-500 opacity-0 group-hover:opacity-100 transform scale-90 group-hover:scale-100 transition-all hover:bg-red-50"
                                                    title="Delete Image"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            )}
                                        </div>
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
                                        <div key={idx} className="relative aspect-square group">
                                            <img src={preview} alt={`Preview ${idx}`} className="w-full h-full object-cover rounded-lg border border-indigo-200 bg-gray-50" />
                                            {/* Remove Button for individual image */}
                                            <button
                                                onClick={() => {
                                                    const newPreviews = [...previews];
                                                    const newFiles = [...selectedFiles];
                                                    URL.revokeObjectURL(newPreviews[idx]);
                                                    newPreviews.splice(idx, 1);
                                                    newFiles.splice(idx, 1);
                                                    setPreviews(newPreviews);
                                                    setSelectedFiles(newFiles);
                                                }}
                                                className="absolute top-1 right-1 p-1 bg-white/90 backdrop-blur rounded-full shadow hover:bg-red-50 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    ))}
                                    
                                    {/* Add More Button (Camera) */}
                                    <div 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-all group"
                                    >
                                        <div className="p-2 bg-gray-100 rounded-full group-hover:bg-white transition-colors">
                                            <svg className="w-6 h-6 text-gray-400 group-hover:text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                        </div>
                                        <span className="text-xs font-medium text-gray-500 group-hover:text-indigo-600 mt-1">Add</span>
                                    </div>
                                </div>
                                <div className="flex justify-end">
                                    <button
                                        onClick={() => { setPreviews([]); setSelectedFiles([]); }}
                                        className="text-xs text-red-600 hover:text-red-700 font-medium"
                                    >
                                        Clear All
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

function ManageVariantsModal({
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
    const [variants, setVariants] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form State
    const [newVariant, setNewVariant] = useState({
        sku: '',
        price: '',
        inventory: '',
        option1: 'Size',
        value1: '',
        option2: '',
        value2: '',
        option3: '',
        value3: ''
    });

    useEffect(() => {
        if (isOpen && product) {
            fetchVariants();
            // Pre-fill SKU based on product
            setNewVariant(prev =>({ 
                ...prev, 
                sku: product.aqModelNumber || '', 
                price: product.finalPrice?.toString() || '' 
            }));
        }
    }, [isOpen, product]);

    const fetchVariants = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}/api/products/${product._id}/variants`);
            setVariants(res.data.variants || []);
        } catch (err) {
            console.error(err);
            setError('Failed to load variants');
        } finally {
            setLoading(false);
        }
    };

    const handleAddVariant = () => {
        if (!newVariant.value1 || !newVariant.price) {
            alert('Please enter at least Option Value and Price');
            return;
        }

        const variant = {
            id: crypto.randomUUID(),
            ...newVariant,
            title: `${newVariant.value1} ${newVariant.value2 || ''} ${newVariant.value3 || ''}`.trim()
        };

        setVariants([...variants, variant]);
        
        // Reset value fields but keep option names/sku/price for easier bulk entry
        setNewVariant(prev => ({
            ...prev,
            value1: '',
            value2: '',
            value3: ''
        }));
    };

    const handleDeleteVariant = (index: number) => {
        const updated = [...variants];
        updated.splice(index, 1);
        setVariants(updated);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await axios.post(`${API_URL}/api/products/${product._id}/variants`, {
                variants: variants
            });
            onSuccess();
            onClose();
        } catch (err) {
            console.error(err);
            setError('Failed to save variants');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen || !product) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
             <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />
             <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
                
                {/* Header */}
                <div className="px-8 py-5 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Manage Variants</h2>
                        <p className="text-sm text-gray-500 mt-1">{product.title}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50">
                    
                    {/* Add Variant Form */}
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-8">
                        <div className="flex items-center gap-2 mb-5">
                            <div className="bg-indigo-100 p-2 rounded-lg">
                                <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                            </div>
                            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Add New Variant</h3>
                        </div>

                        <div className="grid grid-cols-12 gap-4 items-end mb-4">
                            {/* Option Name ex: Size */}
                            <div className="col-span-3">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Option Name</label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. Size, Color" 
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-300"
                                    value={newVariant.option1}
                                    onChange={e => setNewVariant({...newVariant, option1: e.target.value})}
                                />
                            </div>

                            {/* Option Value ex: Small */}
                            <div className="col-span-4">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Option Value <span className="text-red-500">*</span></label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. Small, Red, 10-Pack" 
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                    value={newVariant.value1}
                                    onChange={e => setNewVariant({...newVariant, value1: e.target.value})}
                                />
                            </div>

                            {/* Price */}
                            <div className="col-span-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Price <span className="text-red-500">*</span></label>
                                <div className="relative">
                                    <span className="absolute left-3 top-2 text-gray-400">$</span>
                                    <input 
                                        type="number" 
                                        className="w-full pl-7 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                        value={newVariant.price}
                                        onChange={e => setNewVariant({...newVariant, price: e.target.value})}
                                    />
                                </div>
                            </div>
                            
                            {/* SKU */}
                            <div className="col-span-3">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">SKU</label>
                                <input 
                                    type="text" 
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                    value={newVariant.sku}
                                    onChange={e => setNewVariant({...newVariant, sku: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end pt-2">
                            <button 
                                onClick={handleAddVariant}
                                className="px-5 py-2.5 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 text-sm shadow-sm transition-all hover:shadow-md flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                Add to List
                            </button>
                        </div>
                    </div>

                    {/* Variants Table */}
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                         <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center">
                            <h3 className="text-sm font-bold text-gray-900">Current Variants</h3>
                            <span className="text-xs font-medium bg-gray-200 text-gray-600 px-2 py-1 rounded-full">{variants.length} items</span>
                        </div>
                        
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-3 w-[40%]">Variant Name / Option</th>
                                    <th className="px-6 py-3 w-[25%]">SKU</th>
                                    <th className="px-6 py-3 w-[20%]">Price</th>
                                    <th className="px-6 py-3 w-[15%] text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr><td colSpan={4} className="p-8 text-center text-gray-400">Loading variants...</td></tr>
                                ) : variants.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="p-12 text-center">
                                            <div className="flex flex-col items-center justify-center text-gray-400">
                                                <svg className="w-12 h-12 mb-3 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                                <p className="font-medium">No variants defined yet.</p>
                                                <p className="text-xs mt-1">Add variants above to manage different version of this product.</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    variants.map((v, i) => (
                                        <tr key={i} className="hover:bg-gray-50 transition-colors group">
                                            <td className="px-6 py-4 font-medium text-gray-900">
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-gray-800">{v.value1}</span>
                                                    {(v.option1 && v.option1 !== 'Size' && v.option1 !== 'Color') && <span className="text-xs text-gray-400">{v.option1}</span>}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-gray-500 font-mono text-xs">{v.sku}</td>
                                            <td className="px-6 py-4 text-gray-900 font-medium">${Number(v.price).toFixed(2)}</td>
                                            <td className="px-6 py-4 text-right">
                                                <button 
                                                    onClick={() => handleDeleteVariant(i)}
                                                    className="text-gray-400 hover:text-red-600 font-medium text-xs px-3 py-1.5 rounded hover:bg-red-50 transition-colors"
                                                >
                                                    Remove
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 py-5 border-t border-gray-100 flex justify-end gap-3 bg-white">
                    <button onClick={onClose} className="px-5 py-2.5 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors text-sm">Cancel</button>
                    <button 
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm shadow-md shadow-indigo-200"
                    >
                        {saving ? (
                            <>
                                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                Saving Changes...
                            </>
                        ) : 'Save Variants'}
                    </button>
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
            // Fetch all products (or enough to be useful) - Limitation: Verification needed if backend paginates heavily
            // For now, assuming standard pagination but we filter on client side for the Dropdown UI request
            // Ideally backend should support filtering, but for this task we implement UI filter on loaded page
            const res = await axios.get(`${API_URL}/api/products?page=${p}&limit=500`); 
            setProducts(res.data.products);
            setPages(res.data.pages);
        } catch (err: any) {
            console.error(err);
            setError(err.message + (err.response ? `: ${JSON.stringify(err.response.data)}` : '') + ` (URL: ${API_URL})`);
        } finally {
            setLoading(false);
        }
    };

    // Client-side Manufacturer Filter
    const [selectedMfr, setSelectedMfr] = useState<string>('All');
    const uniqueMfrs = Array.from(new Set(products.map((p: any) => p.aqMfrName))).sort() as string[];
    
    const filteredProducts = selectedMfr === 'All' 
        ? products 
        : products.filter((p: any) => p.aqMfrName === selectedMfr);

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

    // Variant modal state
    const [variantsModalOpen, setVariantsModalOpen] = useState(false);
    
    // Dropdown state
    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

    const handleChangeImage = (product: any) => {
        setOpenDropdownId(null);
        setSelectedProduct(product);
        setImageModalOpen(true);
    };

    const handleManageVariants = (product: any) => {
        setOpenDropdownId(null);
        setSelectedProduct(product);
        setVariantsModalOpen(true);
    };

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (openDropdownId && !(event.target as Element).closest('.action-dropdown')) {
                setOpenDropdownId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [openDropdownId]);

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
                    
                    {/* Header Controls: Manufacturer Filter */}
                    <div className="flex flex-wrap gap-4 items-center">
                        <div className="relative min-w-[240px]">
                            <select 
                                value={selectedMfr}
                                onChange={(e) => setSelectedMfr(e.target.value)}
                                className="w-full appearance-none bg-white border border-gray-300 text-gray-700 py-2.5 px-4 pr-8 rounded-lg leading-tight focus:outline-none focus:bg-white focus:border-indigo-500 text-sm font-medium shadow-sm transition-all hover:border-gray-400 cursor-pointer"
                            >
                                <option value="All">All Manufacturers ({products.length})</option>
                                {uniqueMfrs.map(mfr => (
                                    <option key={mfr} value={mfr}>{mfr}</option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                            </div>
                        </div>

                        {/* Sync Button */}
                        <button
                            onClick={() => triggerAction('sync', 'Sync to Shopify')}
                            disabled={actionLoading !== null}
                            className="inline-flex items-center gap-2 bg-gray-900 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                        >
                            {actionLoading === 'sync' ? (
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
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
                            ) : filteredProducts.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-16 text-center">
                                        <div className="text-gray-400">
                                            <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                                             </svg>
                                             <p className="font-medium">No products found</p>
                                             <p className="text-sm mt-1">{products.length === 0 ? 'Click "Ingest" to import products' : 'Try selecting a different manufacturer'}</p>
                                         </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredProducts.map((p: any) => (
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
                                        <td className="px-6 py-4 text-right relative">
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenDropdownId(openDropdownId === p._id ? null : p._id);
                                                }}
                                                className="action-dropdown inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
                                            >
                                                Actions
                                                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>

                                            {/* Dropdown Menu */}
                                            {openDropdownId === p._id && (
                                                <div className="action-dropdown absolute right-6 top-12 w-48 bg-white rounded-xl shadow-xl border border-gray-100 z-20 overflow-hidden animate-scale-in origin-top-right">
                                                    <div className="py-1">
                                                        <button
                                                            onClick={() => handleChangeImage(p)}
                                                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-indigo-600 flex items-center gap-2"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                            Change Images
                                                        </button>
                                                        <button
                                                            onClick={() => handleManageVariants(p)}
                                                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-indigo-600 flex items-center gap-2"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>
                                                            Manage Variants
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
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

            <ManageVariantsModal
                isOpen={variantsModalOpen}
                product={selectedProduct}
                onClose={() => {
                    setVariantsModalOpen(false);
                    setSelectedProduct(null);
                }}
                onSuccess={() => fetchProducts(page)}
            />
        </div>
    );
}
