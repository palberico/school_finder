import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import CustomAlert from './components/CustomAlert';
import StatsCard from './components/StatsCard';
import Upload from './components/Upload';
import DataList from './components/DataList';
import SchoolsSearch from './components/SchoolsSearch';

function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null); // { message, type, onConfirm? }
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard' | 'schools'

  // Custom Alert Helper
  const showAlert = (message, type = 'info', onConfirm = null) => {
    setAlert({ message, type, onConfirm });
  };

  const closeAlert = () => {
    setAlert(null);
  };

  const handleConfirm = () => {
    if (alert?.onConfirm) {
      alert.onConfirm();
    }
    closeAlert();
  };

  const fetchData = () => {
    setLoading(true);
    // Real-time listener
    const unsubscribe = onSnapshot(collection(db, "contacts"), (snapshot) => {
      const contactsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setData(contactsData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching data: ", error);
      showAlert("Failed to load data from server.", 'error');
      setLoading(false);
    });

    return unsubscribe;
  };

  useEffect(() => {
    const unsubscribe = fetchData();
    return () => unsubscribe();
  }, []);

  return (
    <div>
      {/* Alert Overlay */}
      {alert && (
        <CustomAlert
          message={alert.message}
          type={alert.type}
          onClose={closeAlert}
          onConfirm={handleConfirm}
        />
      )}

      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="logo-area" onClick={() => setCurrentView('dashboard')} style={{ cursor: 'pointer' }}>
            <div className="logo-icon">U</div>
            <h1 className="app-title">UniContacts</h1>
          </div>

          <nav className="main-nav">
            <button
              className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
              onClick={() => setCurrentView('dashboard')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
              Dashboard
            </button>
            <button
              className={`nav-item ${currentView === 'schools' ? 'active' : ''}`}
              onClick={() => setCurrentView('schools')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>
              Schools
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-container">
        {currentView === 'dashboard' ? (
          <>
            {/* Dashboard Grid */}
            <div className="dashboard-grid">
              <StatsCard
                totalRecords={data.length}
                totalContacts={data.filter(item => (item.phone && item.phone.trim()) || (item.email && item.email.trim())).length}
              />
              <Upload onUploadSuccess={() => { }} showAlert={showAlert} />
            </div>

            {/* Data List */}
            <DataList
              data={data}
              loading={loading}
              onRefresh={() => { }}
              showAlert={showAlert}
            />
          </>
        ) : (
          <SchoolsSearch showAlert={showAlert} savedContacts={data} />
        )}
      </main>
    </div>
  );
}

export default App;
