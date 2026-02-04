import React from 'react';

const StatsCard = ({ totalRecords, totalContacts }) => {
    return (
        <div className="dashboard-card stats-card-extended">
            {/* Total Records Section */}
            <div className="stats-section">
                <div className="stats-icon-wrapper">
                    <svg xmlns="http://www.w3.org/2000/svg" className="stats-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                </div>
                <div className="stats-info">
                    <span className="stats-label">Total Records</span>
                    <div className="stats-value">{totalRecords}</div>
                </div>
            </div>

            {/* Divider */}
            <div className="stats-divider"></div>

            {/* Total Contacts Section */}
            <div className="stats-section">
                <div className="stats-icon-wrapper variant-blue">
                    <svg xmlns="http://www.w3.org/2000/svg" className="stats-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                    </svg>
                </div>
                <div className="stats-info">
                    <span className="stats-label">Total Contacts</span>
                    <div className="stats-value">{totalContacts}</div>
                </div>
            </div>
        </div>
    );
};

export default StatsCard;
