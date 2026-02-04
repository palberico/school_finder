import React, { useEffect } from 'react';

const CustomAlert = ({ message, type = 'info', onClose, onConfirm }) => {
    // type: 'info', 'success', 'error', 'confirm'

    useEffect(() => {
        if (type !== 'confirm') {
            const timer = setTimeout(() => {
                onClose();
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [type, onClose]);

    const getIcon = () => {
        switch (type) {
            case 'success':
                return (
                    <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                );
            case 'error':
                return (
                    <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                );
            case 'confirm':
                return (
                    <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                );
            default:
                return (
                    <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                );
        }
    };

    return (
        <div className={`custom-alert-overlay ${type === 'confirm' ? 'blocking' : ''}`}>
            <div className="custom-alert-box">
                <div className="alert-icon-wrapper">
                    {getIcon()}
                </div>
                <div className="alert-content">
                    <p className="alert-message">{message}</p>
                    {type === 'confirm' && (
                        <div className="alert-actions">
                            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                            <button className="btn btn-primary" onClick={onConfirm}>Confirm</button>
                        </div>
                    )}
                </div>
                {type !== 'confirm' && (
                    <button className="alert-close" onClick={onClose}>×</button>
                )}
            </div>
        </div>
    );
};

export default CustomAlert;
