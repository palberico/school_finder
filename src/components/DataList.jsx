import React, { useEffect, useState, useRef } from 'react';
import { db } from '../firebase';
import { deleteDoc, doc, writeBatch } from 'firebase/firestore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const DataList = ({ data, loading, onRefresh, showAlert, showEmailOnly, setShowEmailOnly }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [showContactInfoOnly, setShowContactInfoOnly] = useState(false);
    // showEmailOnly is now a prop

    // Selection State
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        // Click outside to close dropdown
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Reset selection when data changes
    useEffect(() => {
        setSelectedIds(new Set());
    }, [data]);


    const handleDelete = async (id) => {
        showAlert("Are you sure you want to delete this contact?", 'confirm', () => {
            // Confirm callback
            deleteDoc(doc(db, 'contacts', id)).then(() => {
                onRefresh(); // Trigger refresh in parent
                showAlert("Contact deleted successfully", 'success');
            }).catch(error => {
                console.error("Error deleting document: ", error);
                showAlert("Failed to delete contact.", 'error');
            });
        });
    };

    const executeBatchDelete = async () => {
        try {
            const batch = writeBatch(db);
            selectedIds.forEach(id => {
                const docRef = doc(db, 'contacts', id);
                batch.delete(docRef);
            });
            await batch.commit();

            setSelectedIds(new Set());
            setIsDropdownOpen(false);
            onRefresh();
            showAlert("Selected contacts deleted successfully.", 'success');
        } catch (error) {
            console.error("Error batch deleting:", error);
            showAlert("Failed to delete selected contacts.", 'error');
        }
    };

    const handleBatchDelete = () => {
        if (selectedIds.size === 0) return;
        showAlert(`Are you sure you want to delete ${selectedIds.size} selected contacts?`, 'confirm', executeBatchDelete);
    };

    const filteredData = data.filter(item => {
        // 1. Text Search
        const term = searchTerm.toLowerCase();
        const matchesSearch = (
            (item.universityName || '').toLowerCase().includes(term) ||
            (item.contactName || '').toLowerCase().includes(term) ||
            (item.state || '').toLowerCase().includes(term) ||
            (item.email || '').toLowerCase().includes(term)
        );

        // 2. Contact Info Filter (Toggle)
        let matchesContactInfo = true;
        if (showContactInfoOnly) {
            // Must have phone OR email (checking for non-empty string)
            const hasPhone = item.phone && item.phone.trim().length > 0;
            const hasEmail = item.email && item.email.trim().length > 0;
            matchesContactInfo = hasPhone || hasEmail;
        }

        // 3. Email Only Filter
        let matchesEmailOnly = true;
        if (showEmailOnly) {
            const hasEmail = item.email && item.email.trim().length > 0;
            matchesEmailOnly = hasEmail;
        }

        return matchesSearch && matchesContactInfo && matchesEmailOnly;
    });

    // Group by State
    const groupedData = filteredData.reduce((acc, item) => {
        const state = item.state || 'Unknown State';
        if (!acc[state]) acc[state] = [];
        acc[state].push(item);
        return acc;
    }, {});

    const sortedStates = Object.keys(groupedData).sort();

    // Internal Sorting (Always Alphabetical by University)
    sortedStates.forEach(state => {
        groupedData[state].sort((a, b) => {
            return (a.universityName || '').localeCompare(b.universityName || '');
        });
    });

    const exportPDF = (onlySelected = false) => {
        const doc = new jsPDF('l', 'mm', 'a4');
        let yPos = 10;
        doc.setFontSize(18);
        const title = onlySelected ? "University Contacts (Selected)" : "University Contacts";
        doc.text(title, 14, yPos);
        yPos += 10;

        let hasData = false;

        sortedStates.forEach(state => {
            // Filter items if 'onlySelected' is true
            const stateItems = groupedData[state].filter(item =>
                !onlySelected || selectedIds.has(item.id)
            );

            if (stateItems.length === 0) return;
            hasData = true;

            if (yPos > 270) {
                doc.addPage();
                yPos = 20;
            }

            doc.setFontSize(14);
            doc.setTextColor(0, 0, 0);
            doc.text(state, 14, yPos);
            yPos += 5;

            const tableData = stateItems.map(item => [
                item.universityName,
                item.contactName,
                item.title,
                item.phone,
                item.email
            ]);

            autoTable(doc, {
                startY: yPos,
                head: [['University', 'Contact', 'Title', 'Phone', 'Email']],
                body: tableData,
                theme: 'grid',
                headStyles: { fillColor: [75, 85, 99] },
                didDrawPage: (data) => { },
            });

            yPos = doc.lastAutoTable.finalY + 15;
        });

        if (!hasData) {
            showAlert("No items selected to export.", 'info');
            return;
        }

        doc.save('university_contacts.pdf');
        setIsDropdownOpen(false);
    };

    const exportCSV = (onlySelected = false) => {
        let csvContent = "data:text/csv;charset=utf-8,";

        // Headers
        csvContent += "State,University,Contact,Title,Phone,Email\n";

        let hasData = false;

        sortedStates.forEach(state => {
            const stateItems = groupedData[state].filter(item =>
                !onlySelected || selectedIds.has(item.id)
            );

            if (stateItems.length === 0) return;
            hasData = true;

            stateItems.forEach(item => {
                const row = [
                    state,
                    item.universityName || '',
                    item.contactName || '',
                    item.title || '',
                    item.phone || '',
                    item.email || ''
                ].map(field => {
                    // Escape quotes and wrap in quotes if contains comma
                    const stringField = String(field);
                    if (stringField.includes(',') || stringField.includes('"')) {
                        return `"${stringField.replace(/"/g, '""')}"`;
                    }
                    return stringField;
                });
                csvContent += row.join(",") + "\n";
            });
        });

        if (!hasData) {
            showAlert("No items selected to export.", 'info');
            return;
        }

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "university_contacts.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setIsDropdownOpen(false);
    };

    // Selection Handlers
    const handleSelectAllInState = (state, isChecked) => {
        if (!groupedData[state]) return;
        const stateItemIds = groupedData[state].map(item => item.id);

        setSelectedIds(prev => {
            const newSet = new Set(prev);
            stateItemIds.forEach(id => {
                if (isChecked) {
                    newSet.add(id);
                } else {
                    newSet.delete(id);
                }
            });
            return newSet;
        });
    };

    const isStateAllSelected = (state) => {
        if (!groupedData[state] || groupedData[state].length === 0) return false;
        return groupedData[state].every(item => selectedIds.has(item.id));
    };


    const handleSelectRow = (id) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    return (
        <div className="main-content-wrapper">
            <div className="control-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, flexWrap: 'wrap' }}>
                    <input
                        type="text"
                        placeholder="Search contacts..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="search-input"
                        style={{ margin: 0 }}
                    />

                    <label className="toggle-switch-container">
                        <input
                            type="checkbox"
                            className="toggle-input"
                            checked={showContactInfoOnly}
                            onChange={(e) => setShowContactInfoOnly(e.target.checked)}
                        />
                        <div className="toggle-track">
                            <div className="toggle-thumb"></div>
                        </div>
                        <span className="toggle-label">Contact Info</span>
                    </label>

                    <label className="toggle-switch-container">
                        <input
                            type="checkbox"
                            className="toggle-input"
                            checked={showEmailOnly}
                            onChange={(e) => setShowEmailOnly(e.target.checked)}
                        />
                        <div className="toggle-track">
                            <div className="toggle-thumb"></div>
                        </div>
                        <span className="toggle-label">Email Only</span>
                    </label>
                </div>

                <div className="btn-group">
                    {/* Actions Dropdown */}
                    <div className="actions-dropdown-container" ref={dropdownRef}>
                        <button
                            className="btn btn-primary"
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            Actions
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>

                        {isDropdownOpen && (
                            <div className="dropdown-menu">
                                <button
                                    className="dropdown-item"
                                    onClick={() => exportPDF(false)} // Export All
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                    Export All to PDF
                                </button>
                                <button
                                    className="dropdown-item"
                                    onClick={() => exportPDF(true)}
                                    disabled={selectedIds.size === 0}
                                    style={{ opacity: selectedIds.size === 0 ? 0.5 : 1 }}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                    Export Selected PDF ({selectedIds.size})
                                </button>
                                <div style={{ height: '1px', background: 'var(--border-color)', margin: '0.25rem 0' }}></div>
                                <button
                                    className="dropdown-item"
                                    onClick={() => exportCSV(false)}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M10 12h4"></path><path d="M10 16h4"></path><path d="M10 8h4"></path></svg>
                                    Export All to CSV
                                </button>
                                <button
                                    className="dropdown-item"
                                    onClick={() => exportCSV(true)}
                                    disabled={selectedIds.size === 0}
                                    style={{ opacity: selectedIds.size === 0 ? 0.5 : 1 }}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                    Export Selected CSV ({selectedIds.size})
                                </button>
                                <div style={{ height: '1px', background: 'var(--border-color)', margin: '0.25rem 0' }}></div>
                                <button
                                    className="dropdown-item danger"
                                    onClick={handleBatchDelete}
                                    disabled={selectedIds.size === 0}
                                    style={{ opacity: selectedIds.size === 0 ? 0.5 : 1 }}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    Delete Selected ({selectedIds.size})
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="loading-state">Loading data...</div>
            ) : (
                <div className="data-list-container">
                    {sortedStates.length === 0 ? (
                        <div className="empty-state">
                            {data.length === 0 ? "No data found. Upload a JSON file." : "No matches found."}
                        </div>
                    ) : (
                        sortedStates.map(state => (
                            <div key={state} className="state-section">
                                <div className="state-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 className="state-title">{state}</h3>
                                    <span className="text-sm font-medium text-muted">
                                        {groupedData[state].length} {groupedData[state].length === 1 ? 'Record' : 'Records'}
                                    </span>
                                </div>
                                <div className="table-wrapper">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th className="w-10">
                                                    <input
                                                        type="checkbox"
                                                        className="custom-checkbox"
                                                        checked={isStateAllSelected(state)}
                                                        onChange={(e) => handleSelectAllInState(state, e.target.checked)}
                                                        title={`Select All in ${state}`}
                                                        style={{ width: '1.25rem', height: '1.25rem' }}
                                                    />
                                                </th>
                                                <th>University</th>
                                                <th>Contact</th>
                                                <th>Title</th>
                                                <th className="w-48">Phone</th>
                                                <th>Email</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {groupedData[state].map((item, idx) => (
                                                <tr key={item.id || idx} className={selectedIds.has(item.id) ? 'bg-indigo-50/50' : ''}>
                                                    <td>
                                                        <input
                                                            type="checkbox"
                                                            className="custom-checkbox"
                                                            checked={selectedIds.has(item.id)}
                                                            onChange={() => handleSelectRow(item.id)}
                                                            style={{ width: '1.25rem', height: '1.25rem' }}
                                                        />
                                                    </td>
                                                    <td className="cell-main">{item.universityName}</td>
                                                    <td>{item.contactName}</td>
                                                    <td>{item.title}</td>
                                                    <td>{item.phone}</td>
                                                    <td>{item.email}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default DataList;
