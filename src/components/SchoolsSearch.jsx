import React, { useState, useRef, useEffect } from 'react';
import { db } from '../firebase';
import { doc, writeBatch, collection, query, where, getDocs, getDoc, setDoc } from 'firebase/firestore';

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

const PROMPT_TEMPLATE = `Task: Extract executive-level finance and IT contacts for colleges in {state}, focusing ONLY on these institutions:

{schools_list}

You are free to search the web but prioritize official sites.

If you can't find contact information (email/phone number) include the information that you do have.

Targets (include acting/interim):
Finance: CFO, Chief Business Officer, VP/AVP Finance, VP Finance & Administration, Treasurer, Controller, Director/Head of Finance, Budget Director.
IT: CIO, VP IT, Director/Head of IT, Chief Information Security Officer (CISO).

Source rules:
- Use official institutional websites only (school site, system site, official directories). Prefer .edu domains.
- If 2025-dated pages exist, prefer those. Otherwise use most recent official page.
- Do NOT guess emails. Only output an email if it appears on the page. If no personal email exists, use a listed department email. If neither exists, leave emailAddress empty.

Email structure rule:
- Set emailStructure only if the page shows at least 2 staff emails that clearly reveal the pattern. Otherwise set emailStructure to "".

Output rules:
- Return ONLY valid JSON, nothing else.
- Return a JSON array of objects. No trailing commas. No markdown.

Schema for each record:

[
  {
  "name": "",
  "title": "",
  "universityName": "",
  "state": "",
  "emailAddress": "",
  "emailStructure": "",
  "phoneNumber": "",
  "confidenceScore": 0,
  "sourceUrl": ""
  }
]`;

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

    // Prompt Builder State
    const [generatedPrompt, setGeneratedPrompt] = useState(null);
    const [promptTemplate, setPromptTemplate] = useState(PROMPT_TEMPLATE);
    const [isEditingTemplate, setIsEditingTemplate] = useState(false);
    const [loadingTemplate, setLoadingTemplate] = useState(false);

    // Fetch template on mount
    useEffect(() => {
        const fetchTemplate = async () => {
            try {
                const docRef = doc(db, 'settings', 'global');
                const docSnap = await getDoc(docRef);
                if (docSnap.exists() && docSnap.data().promptTemplate) {
                    setPromptTemplate(docSnap.data().promptTemplate);
                }
            } catch (error) {
                console.error("Error fetching template:", error);
            }
        };
        fetchTemplate();
    }, []);

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
    const saveSchoolsToDb = async (schoolsToSave) => {
        const batch = writeBatch(db);
        schoolsToSave.forEach(school => {
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
    };

    const handleSaveSchools = async () => {
        if (selectedSchoolIds.size === 0) return;

        const selectedSchools = schools.filter(s => selectedSchoolIds.has(s.id));
        setLoading(true);
        setIsActionsOpen(false);

        try {
            await saveSchoolsToDb(selectedSchools);
            showAlert(`Successfully saved ${selectedSchools.length} schools to database!`, 'success');
            setSelectedSchoolIds(new Set());

        } catch (error) {
            console.error("Error saving schools:", error);
            showAlert("Failed to save schools.", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleCreatePrompt = async () => {
        if (selectedSchoolIds.size === 0) {
            showAlert("Please select search results to generate a prompt.", "info");
            return;
        }

        const selectedSchools = schools.filter(s => selectedSchoolIds.has(s.id));
        setLoading(true);
        setIsActionsOpen(false);

        try {
            // 1. Save schools first
            await saveSchoolsToDb(selectedSchools);
            showAlert(`Saved ${selectedSchools.length} schools and generated prompt!`, 'success');

            // 2. Generate Prompt using State
            // Note: We use the *current* state promptTemplate, not necessarily the one in DB unless refreshed.
            // But we fetched it on mount.
            generateAndShowPrompt(selectedSchools);

        } catch (error) {
            console.error("Error creating prompt:", error);
            showAlert("Failed to create prompt.", "error");
        } finally {
            setLoading(false);
        }
    };

    const generateAndShowPrompt = (schoolsListObjects) => {
        const stateName = STATES.find(s => s.code === selectedState)?.name || selectedState;

        // Format: Name    Website
        const schoolsListString = schoolsListObjects.map(s => {
            let url = s['school.school_url'] || '';
            return `${s['school.name'].padEnd(40)} ${url}`;
        }).join('\n');

        const prompt = promptTemplate
            .replace('{state}', stateName)
            .replace('{schools_list}', schoolsListString)
            .replace('{name}', '')
            .replace('{website}', '');

        setGeneratedPrompt(prompt);
    };

    const handleSaveTemplate = async () => {
        setLoadingTemplate(true);
        try {
            await setDoc(doc(db, 'settings', 'global'), {
                promptTemplate: promptTemplate
            }, { merge: true });

            setIsEditingTemplate(false);
            showAlert("Template saved successfully!", "success");

            // Regenerate the preview with the new template
            const selectedSchools = schools.filter(s => selectedSchoolIds.has(s.id));
            if (selectedSchools.length > 0) {
                generateAndShowPrompt(selectedSchools);
            }

        } catch (error) {
            console.error("Error saving template:", error);
            showAlert("Failed to save template.", "error");
        } finally {
            setLoadingTemplate(false);
        }
    };

    const copyPromptToClipboard = () => {
        if (!generatedPrompt) return;
        navigator.clipboard.writeText(generatedPrompt);
        showAlert("Prompt copied to clipboard!", "success");
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

            {/* Prompt Builder Modal/Card */}
            {generatedPrompt && (
                <div className="prompt-builder-overlay" style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 1000
                }}>
                    <div className="prompt-builder-card" style={{
                        backgroundColor: 'white',
                        padding: '2rem',
                        borderRadius: '12px',
                        width: '80%',
                        maxWidth: '800px',
                        maxHeight: '90vh',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                        margin: 'auto', // Fix centering
                        boxSizing: 'border-box'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                                    {isEditingTemplate ? 'Edit Prompt Template' : 'Prompt Builder'}
                                </h3>
                                <button
                                    onClick={() => setIsEditingTemplate(!isEditingTemplate)}
                                    className="btn btn-sm"
                                    style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                                >
                                    {isEditingTemplate ? 'Cancel Edit' : 'Edit Template'}
                                </button>
                            </div>
                            <button
                                onClick={() => setGeneratedPrompt(null)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem' }}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>

                        <p className="text-muted" style={{ fontSize: '0.9rem' }}>
                            {isEditingTemplate
                                ? 'Edit the global template. Use {state} and {schools_list} as placeholders.'
                                : 'Edit your prompt if needed for this batch, then copy it to clipboard.'}
                        </p>

                        <textarea
                            value={isEditingTemplate ? promptTemplate : generatedPrompt}
                            onChange={(e) => {
                                if (isEditingTemplate) {
                                    setPromptTemplate(e.target.value);
                                } else {
                                    setGeneratedPrompt(e.target.value);
                                }
                            }}
                            style={{
                                width: '100%',
                                height: '400px',
                                padding: '1rem',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0',
                                fontFamily: 'monospace',
                                fontSize: '0.9rem',
                                lineHeight: '1.5',
                                resize: 'vertical'
                            }}
                        />

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                            <button
                                className="btn"
                                onClick={() => setGeneratedPrompt(null)}
                                style={{ backgroundColor: '#f1f5f9', color: '#475569' }}
                            >
                                Close
                            </button>

                            {isEditingTemplate ? (
                                <button
                                    className="btn btn-primary"
                                    onClick={handleSaveTemplate}
                                    disabled={loadingTemplate}
                                >
                                    {loadingTemplate ? 'Saving...' : 'Save Template'}
                                </button>
                            ) : (
                                <button
                                    className="btn btn-primary"
                                    onClick={copyPromptToClipboard}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                    Copy to Clipboard
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SchoolsSearch;
