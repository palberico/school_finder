import React, { useState, useRef } from 'react';
import { db } from '../firebase';
import { collection, writeBatch, doc } from 'firebase/firestore';
import { normalizeState } from '../utils/states';

const normalizeData = (item) => {
    const getVal = (keys) => {
        for (const key of keys) {
            if (item[key] !== undefined) return item[key];
        }
        return '';
    };

    const rawState = getVal(['state', 'State']);

    return {
        universityName: getVal(['universityName', 'university_name', 'University']),
        state: normalizeState(rawState),
        contactName: getVal(['contactName', 'contact_name', 'Name', 'name']),
        title: getVal(['title', 'Title', 'job_title']),
        phone: getVal(['phone', 'phoneNumber', 'Phone']),
        email: getVal(['email', 'emailAddress', 'Email']),
        confidenceScore: getVal(['confidenceScore', 'ConfidenceScore']),
        sourceUrl: getVal(['sourceUrl', 'sourceURL', 'SourceUrl']),
        structure: getVal(['structure', 'Structure']),
        createdAt: new Date(),
    };
};

const toSlug = (str) => {
    return String(str)
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
};

const Upload = ({ onUploadSuccess, showAlert }) => {
    const [loading, setLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef(null);

    const processFile = (file) => {
        if (!file) return;

        setLoading(true);

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target.result;
                let jsonData = JSON.parse(text);
                let itemsToUpload = [];

                if (Array.isArray(jsonData)) {
                    itemsToUpload = jsonData;
                } else if (jsonData.contacts && Array.isArray(jsonData.contacts)) {
                    itemsToUpload = jsonData.contacts;
                } else {
                    throw new Error("Invalid JSON format. Expected an array or object with 'contacts' array.");
                }

                // Chunk data into sizes of 400 to respect Firestore batch limit (500)
                const chunkSize = 400;
                const chunks = [];
                for (let i = 0; i < itemsToUpload.length; i += chunkSize) {
                    chunks.push(itemsToUpload.slice(i, i + chunkSize));
                }

                for (const chunk of chunks) {
                    const batch = writeBatch(db);
                    chunk.forEach((item) => {
                        const normalizedItem = normalizeData(item);

                        // Generate deterministic ID
                        const uniSlug = toSlug(normalizedItem.universityName || 'unknown');
                        const contactSlug = toSlug(normalizedItem.contactName || 'unknown');
                        const docId = `${uniSlug}_${contactSlug}`;

                        const docRef = doc(db, 'contacts', docId);
                        batch.set(docRef, normalizedItem);
                    });
                    await batch.commit();
                }

                setLoading(false);
                if (onUploadSuccess) onUploadSuccess();
                showAlert('Upload successful!', 'success');
            } catch (err) {
                console.error("Error uploading data: ", err);
                showAlert(err.message || "Failed to upload data.", 'error');
                setLoading(false);
            } finally {
                // Reset file input so the same file can be selected again if needed
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
            }
        };
        reader.readAsText(file);
    };

    const handleFileChange = (event) => {
        processFile(event.target.files[0]);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file && file.type === "application/json") {
            processFile(file);
        } else if (file) {
            showAlert("Please upload a valid JSON file.", 'error');
        }
    };

    const handleClick = () => {
        fileInputRef.current.click();
    };

    return (
        <div className="dashboard-card upload-card-row">
            <div className="upload-info-side">
                <div className="upload-icon-wrapper">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                </div>
                <h3 className="upload-label-main">Upload JSON</h3>
            </div>

            <div
                className={`upload-dropzone-right ${isDragging ? 'active' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleClick}
            >
                <input
                    type="file"
                    accept=".json"
                    onChange={handleFileChange}
                    disabled={loading}
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                />

                {loading ? (
                    <span className="text-violet-600">Uploading...</span>
                ) : (
                    <span>Click or Drag File</span>
                )}
            </div>
        </div>
    );
};

export default Upload;
