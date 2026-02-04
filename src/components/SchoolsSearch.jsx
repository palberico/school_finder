import React, { useState, useRef, useEffect } from 'react';
import { db } from '../firebase';
import { doc, writeBatch, collection, query, where, getDocs } from 'firebase/firestore';

const STATES = [
    { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
    { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
    { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'DC', name: 'District of Columbia' },
    { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' },
    { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
    { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' },
    { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
    { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' },
    { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
    { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' },
    { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
    { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
    { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
    { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' },
    { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
    { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' },
    { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' }
];

const SchoolsSearch = ({ showAlert, savedContacts = [] }) => {
    const [selectedState, setSelectedState] = useState('');
    const [schoolType, setSchoolType] = useState('all'); // all, public, private
    const [loading, setLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('Searching...');
    const [schools, setSchools] = useState([]);
    const [hasSearched, setHasSearched] = useState(false);

    // Selection & Actions
    const [selectedSchoolIds, setSelectedSchoolIds] = useState(new Set());
    const [isActionsOpen, setIsActionsOpen] = useState(false);
    const actionsRef = useRef(null);

    // Sorting State
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (actionsRef.current && !actionsRef.current.contains(event.target)) {
                setIsActionsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Helper: Check if school exists in saved contacts (by name loosely)
    const isSchoolSaved = (schoolName) => {
        if (!schoolName) return false;
        const normalizedSchool = schoolName.toLowerCase().trim();
        return savedContacts.some(contact =>
            (contact.universityName || '').toLowerCase().trim() === normalizedSchool
        );
    };

    const handleSearch = async () => {
        if (!selectedState) {
            showAlert("Please select a state", "error");
            return;
        }

        const apiKey = import.meta.env.VITE_DATA_GOV_API_KEY;
        if (!apiKey || apiKey === 'your_key_here') {
            showAlert("Missing API Key. Please Add VITE_DATA_GOV_API_KEY to .env", "error");
            return;
        }

        setLoading(true);
        setSchools([]);
        setHasSearched(true);
        setSelectedSchoolIds(new Set()); // Reset selection on new search

        try {
            // Build Query
            const baseUrl = `https://api.data.gov/ed/collegescorecard/v1/schools`;
            const params = new URLSearchParams({
                api_key: apiKey,
                'school.state': selectedState,
                'fields': 'id,school.name,school.city,school.zip,school.school_url,school.ownership',
                'per_page': 100 // Limit results for now
            });

            // Ownership: 1=Public, 2=Private Nonprofit, 3=Private For-Profit
            if (schoolType === 'database') {
                // Database Search
                const schoolsRef = collection(db, 'schools');
                const q = query(schoolsRef, where('state', '==', selectedState));
                const querySnapshot = await getDocs(q);

                const dbResults = querySnapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        'school.name': data.name,
                        'school.city': data.city,
                        'school.zip': data.zip,
                        'school.school_url': data.website,
                        'school.ownership': data.ownership
                    };
                });

                setSchools(dbResults);
                setLoading(false);
                return; // Exit early as we don't need the API call
            }

            setLoadingText('Searching...');

            let allSchools = [];
            let page = 0;
            let keepFetching = true;

            while (keepFetching) {
                // Update loading text to show progress if we have multiple pages
                if (page > 0) {
                    setLoadingText(`Loading... (Fetched ${allSchools.length} schools)`);
                }

                const params = new URLSearchParams({
                    api_key: apiKey,
                    'school.state': selectedState,
                    'fields': 'id,school.name,school.city,school.zip,school.school_url,school.ownership',
                    'per_page': 100,
                    'page': page
                });

                if (schoolType === 'public') {
                    params.append('school.ownership', '1');
                } else if (schoolType === 'private') {
                    params.append('school.ownership', '2,3');
                }

                const response = await fetch(`${baseUrl}?${params.toString()}`);

                if (!response.ok) {
                    throw new Error('Failed to fetch data');
                }

                const data = await response.json();
                const results = data.results || [];

                allSchools = [...allSchools, ...results];

                // If we got fewer than 100 results, we've reached the end
                if (results.length < 100) {
                    keepFetching = false;
                } else {
                    page++;
                }
            }

            setSchools(allSchools);

        } catch (error) {
            console.error("Search Error:", error);
            showAlert("Failed to load schools. Please check your API key.", "error");
        } finally {
            setLoading(false);
            setLoadingText('Searching...');
        }
    };

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedSchools = React.useMemo(() => {
        let sortableItems = [...schools];
        if (sortConfig.key !== null) {
            sortableItems.sort((a, b) => {
                let aValue = a[sortConfig.key] || '';
                let bValue = b[sortConfig.key] || '';

                // Case insensitive sort
                if (typeof aValue === 'string') aValue = aValue.toLowerCase();
                if (typeof bValue === 'string') bValue = bValue.toLowerCase();

                if (aValue < bValue) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [schools, sortConfig]);

    // Collapsible Table State
    const [isTableOpen, setIsTableOpen] = useState(true);

    // Selection Handlers
    const handleSelectAll = (isChecked) => {
        if (isChecked) {
            const allIds = new Set(schools.map(gl => gl.id));
            setSelectedSchoolIds(allIds);
        } else {
            setSelectedSchoolIds(new Set());
        }
    };

    const handleSelectRow = (id) => {
        setSelectedSchoolIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    // Actions
    const handleSaveSchools = async () => {
        if (selectedSchoolIds.size === 0) return;

        const selectedSchools = schools.filter(s => selectedSchoolIds.has(s.id));
        setLoading(true);
        setIsActionsOpen(false);

        try {
            const batch = writeBatch(db);

            selectedSchools.forEach(school => {
                // Create a new document in 'schools' collection
                // We use setDoc with merge or just doc() for a new ID. 
                // Let's use the API ID as the doc ID to prevent duplicates easily? 
                // data.gov IDs are unique integers. Let's use stringified version.
                const docRef = doc(db, 'schools', String(school.id));

                let url = school['school.school_url'];
                if (url && !url.startsWith('http')) {
                    url = `https://${url}`;
                }

                batch.set(docRef, {
                    name: school['school.name'],
                    city: school['school.city'],
                    zip: school['school.zip'],
                    state: selectedState,
                    website: url || '',
                    ownership: school['school.ownership'],
                    savedAt: new Date().toISOString()
                }, { merge: true });
            });

            await batch.commit();
            showAlert(`Successfully saved ${selectedSchools.length} schools to database!`, 'success');
            setSelectedSchoolIds(new Set());

        } catch (error) {
            console.error("Error saving schools:", error);
            showAlert("Failed to save schools.", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleCreatePrompt = () => {
        showAlert("Create Prompt feature is coming soon!", "info");
        setIsActionsOpen(false);
    };

    const handleExportCSV = () => {
        if (schools.length === 0) {
            showAlert("No schools to export.", "info");
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        // Headers
        csvContent += "School Name,Website\n";

        schools.forEach(school => {
            let url = school['school.school_url'];
            if (url && !url.startsWith('http')) {
                url = `https://${url}`;
            }

            const name = school['school.name'] || '';
            const website = url || '';

            // Escape quotes
            const escapedName = name.includes(',') || name.includes('"') ? `"${name.replace(/"/g, '""')}"` : name;
            const escapedWebsite = website.includes(',') || website.includes('"') ? `"${website.replace(/"/g, '""')}"` : website;

            csvContent += `${escapedName},${escapedWebsite}\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "schools_export.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setIsActionsOpen(false);
    };

    const allSelected = schools.length > 0 && selectedSchoolIds.size === schools.length;

    return (
        <div className="schools-container">
            <div className="schools-search-card">
                <h2 className="search-title">Search Schools</h2>
                <div className="search-controls">
                    <select
                        className="search-select"
                        value={selectedState}
                        onChange={(e) => setSelectedState(e.target.value)}
                    >
                        <option value="">Select a state</option>
                        {STATES.map(s => (
                            <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                        ))}
                    </select>

                    <select
                        className="search-select type-select"
                        value={schoolType}
                        onChange={(e) => setSchoolType(e.target.value)}
                    >
                        <option value="all">All Schools</option>
                        <option value="public">Public Only</option>
                        <option value="private">Private Only</option>
                        <option disabled>──────────</option>
                        <option value="database">Database</option>
                    </select>

                    <button
                        className="btn btn-primary search-btn"
                        onClick={handleSearch}
                        disabled={loading}
                    >
                        {loading ? loadingText : (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                Search
                            </>
                        )}
                    </button>
                </div>
            </div>

            {hasSearched && (
                <div className="schools-results-card">
                    <div className="results-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 className="results-count">
                            {loading ? loadingText : `${schools.length} Schools Found`}
                        </h3>

                        {/* Actions Dropdown */}
                        {!loading && schools.length > 0 && (
                            <div className="actions-dropdown-container" ref={actionsRef}>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => setIsActionsOpen(!isActionsOpen)}
                                    // Removed disabled check so user can always open to export
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    Actions
                                    {selectedSchoolIds.size > 0 && ` (${selectedSchoolIds.size})`}
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                </button>

                                {isActionsOpen && (
                                    <div className="dropdown-menu">
                                        <button
                                            className="dropdown-item"
                                            onClick={handleSaveSchools}
                                            disabled={selectedSchoolIds.size === 0}
                                            style={{ opacity: selectedSchoolIds.size === 0 ? 0.5 : 1 }}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                                            Save Schools
                                        </button>
                                        <button className="dropdown-item" onClick={handleCreatePrompt}>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                                            Create Prompt
                                        </button>
                                        <div style={{ height: '1px', background: 'var(--border-color)', margin: '0.25rem 0' }}></div>
                                        <button className="dropdown-item" onClick={handleExportCSV}>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M12 18v-6"></path><path d="M9 15l3 3 3-3"></path></svg>
                                            Export CSV
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {!loading && schools.length > 0 && (
                        <div className="table-wrapper">
                            <table className="data-table" style={{ tableLayout: 'fixed' }}>
                                <thead>
                                    <tr>
                                        <th className="w-10" style={{ width: '50px' }}>
                                            <input
                                                type="checkbox"
                                                className="custom-checkbox"
                                                checked={allSelected}
                                                onChange={(e) => handleSelectAll(e.target.checked)}
                                                style={{ width: '1.25rem', height: '1.25rem' }}
                                            />
                                        </th>
                                        <th
                                            style={{ width: '30%', cursor: 'pointer', userSelect: 'none' }}
                                            onClick={() => handleSort('school.name')}
                                            className="hover:bg-gray-50"
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                School Name
                                                <div style={{ display: 'flex', flexDirection: 'column', height: '14px', justifyContent: 'center' }}>
                                                    {sortConfig.key === 'school.name' ? (
                                                        sortConfig.direction === 'asc' ? (
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
                                                        ) : (
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                                        )
                                                    ) : (
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 15l5 5 5-5"></path><path d="M7 9l5-5 5 5"></path></svg>
                                                    )}
                                                </div>
                                            </div>
                                        </th>
                                        <th style={{ width: '40%' }}>Address</th>
                                        <th
                                            onClick={() => setIsTableOpen(!isTableOpen)}
                                            style={{
                                                width: '25%',
                                                cursor: 'pointer',
                                                userSelect: 'none'
                                            }}
                                            className="hover:bg-gray-50"
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                Website
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    width="16"
                                                    height="16"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    style={{
                                                        transform: isTableOpen ? 'rotate(0deg)' : 'rotate(180deg)',
                                                        transition: 'transform 0.2s ease'
                                                    }}
                                                >
                                                    <polyline points="6 9 12 15 18 9"></polyline>
                                                </svg>
                                            </div>
                                        </th>
                                    </tr>
                                </thead>
                                {isTableOpen && (
                                    <tbody>
                                        {sortedSchools.map((school) => {
                                            let url = school['school.school_url'];
                                            if (url && !url.startsWith('http')) {
                                                url = `https://${url}`;
                                            }
                                            const exists = isSchoolSaved(school['school.name']);
                                            const isSelected = selectedSchoolIds.has(school.id);

                                            return (
                                                <tr
                                                    key={school.id}
                                                    className={`
                                                        ${exists ? 'row-exists' : ''} 
                                                        ${isSelected ? 'row-selected' : ''}
                                                    `}
                                                >
                                                    <td>
                                                        <input
                                                            type="checkbox"
                                                            className="custom-checkbox"
                                                            checked={isSelected}
                                                            onChange={() => handleSelectRow(school.id)}
                                                            style={{ width: '1.25rem', height: '1.25rem' }}
                                                        />
                                                    </td>
                                                    <td className="cell-main">
                                                        {school['school.name']}
                                                        {exists && <span className="exists-badge">Saved</span>}
                                                    </td>
                                                    <td>{school['school.city']}, {selectedState} {school['school.zip']}</td>
                                                    <td>
                                                        {url ? (
                                                            <a href={url} target="_blank" rel="noopener noreferrer" className="visit-link">
                                                                Visit
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                                            </a>
                                                        ) : (
                                                            <span className="text-muted">-</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                )}
                            </table>
                        </div>
                    )}

                    {!loading && hasSearched && schools.length === 0 && (
                        <div className="empty-state">No schools found matching your criteria.</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default SchoolsSearch;
