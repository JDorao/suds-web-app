import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs, writeBatch, orderBy } from 'firebase/firestore';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';


// Define a context for Firebase and user data
const AppContext = createContext(null);

// Custom hook to use the app context
const useAppContext = () => useContext(AppContext);

// --- Firebase Configuration and Initialization ---
let firebaseConfig = {};
let currentAppId = '';

// Check if running in Canvas environment (where __firebase_config is defined)
if (typeof __firebase_config !== 'undefined' && typeof __app_id !== 'undefined') {
  firebaseConfig = JSON.parse(__firebase_config);
  currentAppId = __app_id;
} else {
  // Assume standard web environment (e.g., Vite dev/build)
  // These environment variables need to be set in a .env file (e.e., .env.local)
  firebaseConfig = {
    apiKey: import.meta.env.VITE_APP_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_APP_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_APP_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_APP_FIREBASE_APP_ID
  };
  currentAppId = firebaseConfig.appId;
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const appId = currentAppId; // Use the determined appId

// --- Role Definitions ---
const ROLES = {
  MASTER: 'Master',
  SUDS_SPECIALIST: 'Especialista en SUDS',
  CONTRACT_MANAGER: 'Responsable de contrato',
  READER: 'Lector',
};

// --- Helper function for custom modal (instead of alert/confirm) ---
const CustomModal = ({ message, onConfirm, onCancel, showCancel = false }) => {
  if (!message) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full text-center">
        <p className="text-lg font-semibold mb-4">{message}</p>
        <div className="flex justify-center space-x-4">
          {showCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400 transition-colors"
            >
              Cancelar
            </button>
          )}
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Login Modal Component ---
const LoginModal = ({ isOpen, onClose, onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await onLogin(email, password);
      onClose();
    } catch (err) {
      setError('Error de inicio de sesión. Comprueba tus credenciales.');
      console.error("Login error:", err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full">
        <h3 className="text-xl font-semibold text-gray-800 mb-4 text-center">Identificarse</h3>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="loginEmail" className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico</label>
            <input
              type="email"
              id="loginEmail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
          <div className="mb-6">
            <label htmlFor="loginPassword" className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <input
              type="password"
              id="loginPassword"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Entrar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


// --- Tab Button Component ---
const TabButton = ({ label, tabId, activeTab, setActiveTab }) => (
  <button
    onClick={() => setActiveTab(tabId)}
    className={`px-4 py-2 rounded-md transition-all duration-200 ease-in-out
      ${activeTab === tabId
        ? 'bg-blue-700 text-white shadow-lg'
        : 'bg-gray-200 text-gray-700 hover:bg-blue-100 hover:text-blue-700'
      }
      text-sm md:text-base font-medium whitespace-nowrap`}
  >
    {label}
  </button>
);


// --- Main App Component ---
const App = () => {
  const [activeTab, setActiveTab] = useState('sudsTypes');
  const [currentUser, setCurrentUser] = useState(null);
  const [userId, setUserId] = useState('');
  const [userEmail, setUserEmail] = useState(''); // New state for user email
  const [userRole, setUserRole] = useState(ROLES.READER); // Default to Lector
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalConfirmAction, setModalConfirmAction] = useState(null);
  const [showModalCancel, setShowModalCancel] = useState(false);
  const fileInputRef = useRef(null); // Ref for the file input
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false); // New state to track if logged in (not anonymous)

  // Function to get user role from Firestore
  const fetchUserRole = async (uid, email) => {
    if (!db || !uid) return ROLES.READER; // Default to reader if no UID
    try {
      const userDocRef = doc(db, `artifacts/${appId}/public/data/userProfiles`, uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        return userData.role || ROLES.READER;
      } else {
        // If user document doesn't exist, create it as a Reader by default
        const safeEmail = email || `anonymous-${uid.substring(0, 8)}@app.com`; // Provide a fallback email, unique for anonymous
        await setDoc(userDocRef, {
          uid: uid,
          email: safeEmail,
          name: safeEmail.split('@')[0], // Use safeEmail here to avoid null.split error
          role: ROLES.READER,
          lastSentTimestamp: new Date(), // Initialize timestamp
        }, { merge: true });
        return ROLES.READER;
      }
    } catch (error) {
      console.error("Error fetching/setting user role:", error);
      return ROLES.READER; // Fallback to reader on error
    }
  };

  useEffect(() => {
    // Firebase Authentication
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        setUserId(user.uid);
        setUserEmail(user.email);
        const fetchedRole = await fetchUserRole(user.uid, user.email);
        setUserRole(fetchedRole);
        setIsLoggedIn(!user.isAnonymous); // Set isLoggedIn based on anonymous status
        console.log("Authenticated user:", user.uid, "Role:", fetchedRole, "Is Anonymous:", user.isAnonymous);
      } else {
        // If no user (e.g., after logout), sign in anonymously for default reader access
        try {
          if (typeof __initial_auth_token !== 'undefined') {
            // For Canvas environment, try custom token first
            await signInWithCustomToken(auth, __initial_auth_token);
            const canvasUser = auth.currentUser;
            setCurrentUser(canvasUser);
            setUserId(canvasUser?.uid || crypto.randomUUID());
            setUserEmail(canvasUser?.email || `anonymous-${canvasUser?.uid.substring(0, 8) || 'canvas'}@canvas.com`); // Use safe email for canvas anon
            const fetchedRole = await fetchUserRole(canvasUser?.uid, canvasUser?.email);
            setUserRole(fetchedRole);
            setIsLoggedIn(!canvasUser.isAnonymous); // This will be false for anonymous token
            console.log("Signed in with custom token (Canvas environment).");
          } else {
            // For general web environment, sign in anonymously
            await signInAnonymously(auth);
            const anonUser = auth.currentUser;
            setCurrentUser(anonUser);
            setUserId(anonUser?.uid || crypto.randomUUID());
            setUserEmail(anonUser?.email || `anonymous-${anonUser?.uid.substring(0, 8) || 'app'}@app.com`); // Use safe email for app anon
            const fetchedRole = await fetchUserRole(anonUser?.uid, anonUser?.email);
            setUserRole(fetchedRole);
            setIsLoggedIn(!anonUser.isAnonymous); // This will be false for anonymous user
            console.log("Signed in anonymously (web environment).");
          }
        } catch (error) {
          console.error("Error during Firebase sign-in:", error);
          setModalMessage(`Error al iniciar sesión: ${error.message}`);
          setUserId(crypto.randomUUID()); // Fallback to a random ID if authentication fails
          setUserEmail('error@app.com');
          setUserRole(ROLES.READER); // Ensure role is reader on auth error
          setIsLoggedIn(false); // Ensure false on auth error
        }
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  const handleLogin = async (email, password) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will handle setting currentUser, userId, userEmail, userRole, and isLoggedIn
    } catch (error) {
      console.error("Error logging in:", error);
      throw error; // Re-throw to allow LoginModal to show error
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // onAuthStateChanged will handle setting user back to anonymous/reader
      showCustomModal("Sesión cerrada con éxito.", () => {});
    } catch (error) {
      console.error("Error logging out:", error);
      showCustomModal(`Error al cerrar sesión: ${error.message}`, () => {});
    }
  };

  const showCustomModal = (message, onConfirm, showCancel = false, onCancel = null) => {
    setModalMessage(message);
    setShowModalCancel(showCancel);
    setModalConfirmAction(() => ({ confirm: onConfirm, cancel: onCancel }));
  };

  const handleModalConfirm = () => {
    if (modalConfirmAction && modalConfirmAction.confirm) {
      modalConfirmAction.confirm();
    }
    setModalMessage('');
    setModalConfirmAction(null);
    setShowModalCancel(false);
  };

  const handleModalCancel = () => {
    if (modalConfirmAction && modalConfirmAction.cancel) {
      modalConfirmAction.cancel();
    }
    setModalMessage('');
    setModalConfirmAction(null);
    setShowModalCancel(false);
  };

  const handleExportData = async () => {
    showCustomModal("Preparando datos para descargar...", () => {});
    try {
      const collectionsToExport = ['sudsTypes', 'contracts', 'maintenanceActivities', 'userProfiles']; // Include userProfiles for Master export
      const appSettingsDocs = ['maintenanceCategories', 'definedActivityNames'];
      const exportedData = {};

      for (const collectionName of collectionsToExport) {
        const snapshot = await getDocs(collection(db, `artifacts/${appId}/public/data/${collectionName}`));
        exportedData[collectionName] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      exportedData.appSettings = {};
      for (const docName of appSettingsDocs) {
        const docSnap = await getDoc(doc(db, `artifacts/${appId}/public/data/appSettings`, docName));
        if (docSnap.exists()) {
          exportedData.appSettings[docName] = docSnap.data();
        }
      }

      const dataStr = JSON.stringify(exportedData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `suds_maintenance_data_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showCustomModal("Datos descargados con éxito.", () => {});
    } catch (error) {
      console.error("Error exporting data:", error);
      showCustomModal(`Error al descargar datos: ${error.message}`);
    }
  };

  const handleImportData = () => {
    fileInputRef.current.click(); // Trigger the hidden file input click
  };

  const processImportFile = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      showCustomModal("No se seleccionó ningún archivo.");
      return;
    }

    showCustomModal("¿Estás seguro de que quieres cargar estos datos? Esto REEMPLAZARÁ toda la información existente en la aplicación.",
      async () => {
        try {
          const reader = new FileReader();
          reader.onload = async (e) => {
            try {
              const importedData = JSON.parse(e.target.result);

              const collectionsToImport = ['sudsTypes', 'contracts', 'maintenanceActivities', 'userProfiles'];
              const appSettingsDocs = ['maintenanceCategories', 'definedActivityNames'];

              // Clear existing data in collections
              for (const collectionName of collectionsToImport) {
                const q = collection(db, `artifacts/${appId}/public/data/${collectionName}`);
                const snapshot = await getDocs(q);
                const batch = writeBatch(db); // Corrected: Call writeBatch() with db instance
                snapshot.docs.forEach(d => batch.delete(d.ref));
                await batch.commit();
                console.log(`Cleared collection: ${collectionName}`);
              }

              // Import new data into collections
              for (const collectionName of collectionsToImport) {
                if (importedData[collectionName] && Array.isArray(importedData[collectionName])) {
                  const batch = writeBatch(db); // Corrected: Call writeBatch() with db instance
                  importedData[collectionName].forEach(item => {
                    const docRef = doc(db, `artifacts/${appId}/public/data/${collectionName}`, item.id);
                    batch.set(docRef, item, { merge: true }); // Use merge to avoid overwriting entire docs if they exist
                  });
                  await batch.commit();
                  console.log(`Imported data into collection: ${collectionName}`);
                }
              }

              // Import appSettings documents
              if (importedData.appSettings) {
                for (const docName of appSettingsDocs) {
                  if (importedData.appSettings[docName]) {
                    await setDoc(doc(db, `artifacts/${appId}/public/data/appSettings`, docName), importedData.appSettings[docName], { merge: true });
                    console.log(`Imported app setting: ${docName}`);
                  }
                }
              }

              showCustomModal("Datos cargados con éxito. La aplicación se actualizará.", () => {
                window.location.reload(); // Force a reload to ensure all states are reset and data re-fetched
              });
            } catch (parseError) {
              console.error("Error parsing imported file:", parseError);
              showCustomModal(`Error al procesar el archivo: ${parseError.message}`);
            }
          };
          reader.readAsText(file);
        } catch (error) {
          console.error("Error importing data:", error);
          showCustomModal(`Error al cargar datos: ${error.message}`);
        }
      },
      true
    );
    event.target.value = '';
  };

  // --- Reordering Functions (Centralized) ---
  const handleMoveSudsType = async (sudsId, direction, currentSudsTypes) => {
    if (userRole === ROLES.READER) return; // Only allow editing roles

    const currentIndex = currentSudsTypes.findIndex(s => s.id === sudsId);
    if (currentIndex === -1) return;

    const newSudsTypesOrder = [...currentSudsTypes];

    if (direction === 'up' && currentIndex > 0) {
      [newSudsTypesOrder[currentIndex - 1], newSudsTypesOrder[currentIndex]] = [newSudsTypesOrder[currentIndex], newSudsTypesOrder[currentIndex - 1]];
    } else if (direction === 'down' && currentIndex < newSudsTypesOrder.length - 1) {
      [newSudsTypesOrder[currentIndex + 1], newSudsTypesOrder[currentIndex]] = [newSudsTypesOrder[currentIndex], newSudsTypesOrder[currentIndex + 1]];
    } else {
      return;
    }

    const batch = writeBatch(db);
    newSudsTypesOrder.forEach((suds, index) => {
      if (suds.order !== index || suds.order === undefined) {
        batch.update(doc(db, `artifacts/${appId}/public/data/sudsTypes`, suds.id), { order: index });
      }
    });

    try {
      await batch.commit();
    } catch (error) {
      console.error("Error moving SUDS type:", error);
      showCustomModal(`Error al mover el tipo de SUDS: ${error.message}`);
    }
  };

  const handleMoveActivityColumn = async (category, activityName, direction, currentDefinedActivityNames) => {
    if (userRole === ROLES.READER) return; // Only allow editing roles

    const currentCategoryActivities = currentDefinedActivityNames[category] || [];
    const currentIndex = currentCategoryActivities.indexOf(activityName);
    const newActivities = [...currentCategoryActivities];

    if (direction === 'left' && currentIndex > 0) {
      [newActivities[currentIndex - 1], newActivities[currentIndex]] = [newActivities[currentIndex], newActivities[currentIndex - 1]];
    } else if (direction === 'right' && currentIndex < newActivities.length - 1) {
      [newActivities[currentIndex + 1], newActivities[currentIndex]] = [newActivities[currentIndex], newActivities[currentIndex + 1]];
    } else {
      return;
    }

    const updatedDefinedActivities = {
      ...currentDefinedActivityNames,
      [category]: newActivities
    };

    try {
      await setDoc(doc(db, `artifacts/${appId}/public/data/appSettings`, 'definedActivityNames'), updatedDefinedActivities);
    } catch (error) {
      console.error("Error moving activity column:", error);
      showCustomModal(`Error al mover la actividad: ${error.message}`);
    }
  };

  // Removed handleSendUpdates function and related state/UI


  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 font-inter">
        <div className="text-xl text-gray-700">Cargando aplicación...</div>
      </div>
    );
  }

  return (
    <AppContext.Provider value={{ db, auth, userId, userEmail, userRole, appId, showCustomModal, handleMoveSudsType, handleMoveActivityColumn, ROLES }}>
      <div className="min-h-screen bg-gray-100 font-inter flex flex-col">
        <CustomModal
          message={modalMessage}
          onConfirm={handleModalConfirm}
          onCancel={handleModalCancel}
          showCancel={showModalCancel}
        />
        <LoginModal
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          onLogin={handleLogin}
        />

        {/* Header */}
        <header className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg p-4 md:p-6">
          <div className="container mx-auto flex flex-col md:flex-row justify-between items-center">
            <h1 className="text-2xl md:text-3xl font-bold mb-2 md:mb-0">Gestión del Mantenimiento de SUDS en Madrid</h1>
            <div className="flex items-center space-x-4 mb-2 md:mb-0">
              {/* Madrid City Council Logo */}
              <img
                src="https://diario.madrid.es/wp-content/uploads/2016/06/foto-marca-diario.png"
                alt="Logo del Ayuntamiento de Madrid"
                className="h-10 w-10 object-contain rounded-md"
                onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/40x40/cccccc/ffffff?text=Ayto`; }}
              />
              {/* Madrid Nuevo Norte Logo */}
              <img
                src="https://image.pitchbook.com/rdjct1ADAytcUTYGiOZycNNZceZ1663601340509_200x200"
                alt="Logo de Madrid Nuevo Norte"
                className="h-10 w-10 object-contain rounded-md"
                onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/40x40/cccccc/ffffff?text=MNN`; }}
              />
            </div>
            <div className="flex flex-col items-center md:items-end text-sm md:text-base">
              <span>Usuario: <span className="font-semibold">{userEmail}</span> | Rol: <span className="font-semibold">{userRole}</span></span>
              <div className="mt-2 flex space-x-2">
                {isLoggedIn ? ( // Use isLoggedIn state here
                  <>
                    {/* Removed "Enviar Cambios" button */}
                    <button
                      onClick={handleLogout}
                      className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors shadow-md text-sm"
                    >
                      Cerrar Sesión
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setShowLoginModal(true)}
                    className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors shadow-md text-sm"
                  >
                    Identificarse
                  </button>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Navigation Tabs */}
        <nav className="bg-white shadow-md py-3 px-4">
          <div className="container mx-auto flex flex-wrap justify-center md:justify-start gap-2 md:gap-4">
            <TabButton label="Tipos de SUDS y elementos auxiliares" tabId="sudsTypes" activeTab={activeTab} setActiveTab={setActiveTab} />
            <TabButton label="Contratos de mantenimiento" tabId="contracts" activeTab={activeTab} setActiveTab={setActiveTab} />
            <TabButton label="Definición de Actividades por SUDS" tabId="sudsActivityDefinition" activeTab={activeTab} setActiveTab={setActiveTab} />
            <TabButton label="Detalle de Actividades por SUDS" tabId="sudsActivityDetails" activeTab={activeTab} setActiveTab={setActiveTab} />
            <TabButton label="Resumen por contrato y validación" tabId="summary" activeTab={activeTab} setActiveTab={setActiveTab} />
            <TabButton label="Resumen Visual" tabId="visualSummary" activeTab={activeTab} setActiveTab={setActiveTab} />
            {userRole === ROLES.MASTER && (
              <TabButton label="Gestión de usuarios" tabId="userManagement" activeTab={activeTab} setActiveTab={setActiveTab} />
            )}
          </div>
        </nav>

        {/* Import/Export Buttons (Only visible to Master for full control) */}
        {userRole === ROLES.MASTER && (
          <div className="bg-gray-200 p-3 flex flex-wrap justify-center gap-4 shadow-inner">
            <button
              onClick={handleExportData}
              className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors shadow-md text-sm"
            >
              Descargar Datos
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={processImportFile}
              accept=".json"
              className="hidden"
            />
            <button
              onClick={handleImportData}
              className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors shadow-md text-sm"
            >
              Subir Datos
            </button>
          </div>
        )}


        {/* Main Content Area */}
        <main className="flex-grow container mx-auto p-4 md:p-6">
          {activeTab === 'sudsTypes' && <SudsTypesTab />}
          {activeTab === 'contracts' && <ContractsTab />}
          {activeTab === 'sudsActivityDefinition' && <SudsActivityDefinitionTab />}
          {activeTab === 'sudsActivityDetails' && <SudsActivityDetailsTab />}
          {activeTab === 'summary' && <SummaryTab />}
          {activeTab === 'visualSummary' && <VisualSummaryTab />}
          {activeTab === 'userManagement' && userRole === ROLES.MASTER && <UserManagementTab />}
        </main>

        {/* Footer */}
        <footer className="bg-gray-800 text-white text-center p-4 text-sm">
          © {new Date().getFullYear()} Gestión del Mantenimiento de SUDS en Madrid. Todos los derechos reservados.
        </footer>
      </div>
    </AppContext.Provider>
  );
};

// --- Tab 1: Tipos de SUDS y elementos auxiliares ---
const SudsTypesTab = () => {
  const { db, userId, userRole, appId, showCustomModal, ROLES } = useAppContext();
  const [sudsTypes, setSudsTypes] = useState([]);
  const [newSudsName, setNewSudsName] = useState('');
  const [newSudsDescription, setNewSudsDescription] = useState('');
  const [newSudsImageUrl, setNewSudsImageUrl] = useState('');
  const [newSudsLocationTypes, setNewSudsLocationTypes] = useState([]);
  const [editingSudsId, setEditingSudsId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddSudsForm, setShowAddSudsForm] = useState(false);
  const [filterLocationTypes, setFilterLocationTypes] = useState([]);
  const [generatingDescription, setGeneratingDescription] = useState(false);

  const canEdit = userRole === ROLES.MASTER || userRole === ROLES.SUDS_SPECIALIST;

  const locationTypeOptions = [
    { id: 'acera', name: 'SUDS en acera', icon: '🚶‍♀️' },
    { id: 'zona_verde', name: 'SUDS en zona verde', icon: '🌳' },
    { id: 'viario', name: 'SUDS en viario', icon: '🚗' },
    { id: 'infraestructura', name: 'Elementos Auxiliares', icon: 'https://img.freepik.com/vector-premium/icono-tuberia-fontanero-vector-simple-servicio-agua-tubo-aguas-residuales_98396-55465.jpg' },
  ];

  useEffect(() => {
    if (!db || !appId) return;

    const q = collection(db, `artifacts/${appId}/public/data/sudsTypes`);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const types = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSudsTypes(types);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching SUDS types:", error);
      showCustomModal(`Error al cargar tipos de SUDS: ${error.message}`);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [db, appId, showCustomModal]);

  const handleToggleLocationType = (typeId) => {
    if (!canEdit) return;
    setNewSudsLocationTypes(prev =>
      prev.includes(typeId) ? prev.filter(id => id !== typeId) : [...prev, typeId]
    );
  };

  const handleToggleFilterLocationType = (typeId) => {
    setFilterLocationTypes(prev =>
      prev.includes(typeId) ? prev.filter(id => id !== typeId) : [...prev, typeId]
    );
  };

  const handleGenerateSudsDescription = async () => {
    if (!canEdit) return;
    if (!newSudsName.trim()) {
      showCustomModal("Por favor, introduce el nombre del SUDS para generar una descripción.");
      return;
    }

    setGeneratingDescription(true);
    try {
      const locationNames = newSudsLocationTypes.map(id => locationTypeOptions.find(opt => opt.id === id)?.name).filter(Boolean);
      const locationPrompt = locationNames.length > 0 ? `Si los tipos de ubicación son: ${locationNames.join(', ')}.` : '';

      const prompt = `Genera una descripción detallada para un SUDS llamado "${newSudsName.trim()}". ${locationPrompt} Enfócate en su función, beneficios y características principales en el contexto de Madrid. La descripción debe ser concisa y profesional, de unas 3-5 frases.`;

      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: prompt }] });
      const payload = { contents: chatHistory };
      const apiKey = "";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const text = result.candidates[0].content.parts[0].text;
        setNewSudsDescription(text);
      } else {
        showCustomModal("No se pudo generar la descripción. Inténtalo de nuevo.");
      }
    } catch (error) {
      console.error("Error calling Gemini API:", error);
      showCustomModal(`Error al generar descripción: ${error.message}`);
    } finally {
      setGeneratingDescription(false);
    }
  };

  const handleAddOrUpdateSuds = async () => {
    if (!canEdit) return;
    if (!newSudsName.trim() || !newSudsDescription.trim()) {
      showCustomModal("Por favor, rellena el nombre y la descripción del SUDS.");
      return;
    }

    try {
      const sudsData = {
        name: newSudsName.trim(),
        description: newSudsDescription.trim(),
        imageUrls: newSudsImageUrl.trim() ? [newSudsImageUrl.trim()] : [],
        locationTypes: newSudsLocationTypes,
        lastUpdatedBy: userId,
        timestamp: new Date(),
      };

      if (editingSudsId) {
        await updateDoc(doc(db, `artifacts/${appId}/public/data/sudsTypes`, editingSudsId), sudsData);
        showCustomModal("Tipo de SUDS actualizado con éxito.");
      } else {
        await addDoc(collection(db, `artifacts/${appId}/public/data/sudsTypes`), sudsData);
        showCustomModal("Nuevo tipo de SUDS añadido con éxito.");
      }
      setNewSudsName('');
      setNewSudsDescription('');
      setNewSudsImageUrl('');
      setNewSudsLocationTypes([]);
      setEditingSudsId(null);
      setShowAddSudsForm(false);
    } catch (error) {
      console.error("Error adding/updating SUDS type:", error);
      showCustomModal(`Error al guardar tipo de SUDS: ${error.message}`);
    }
  };

  const handleEditSuds = (suds) => {
    if (!canEdit) return;
    setNewSudsName(suds.name);
    setNewSudsDescription(suds.description);
    setNewSudsImageUrl(suds.imageUrls && suds.imageUrls.length > 0 ? suds.imageUrls[0] : '');
    setNewSudsLocationTypes(suds.locationTypes || []);
    setEditingSudsId(suds.id);
    setShowAddSudsForm(true);
  };

  const handleDeleteSuds = async (id) => {
    if (!canEdit) return;
    showCustomModal(
      "¿Estás seguro de que quieres eliminar este tipo de SUDS?",
      async () => {
        try {
          await deleteDoc(doc(db, `artifacts/${appId}/public/data/sudsTypes`, id));
          showCustomModal("Tipo de SUDS eliminado con éxito.");
        } catch (error) {
          console.error("Error deleting SUDS type:", error);
          showCustomModal(`Error al eliminar tipo de SUDS: ${error.message}`);
        }
      },
      true
    );
  };

  const filteredSudsTypes = sudsTypes.filter(suds => {
    if (filterLocationTypes.length === 0) return true;
    return filterLocationTypes.some(filterType => suds.locationTypes?.includes(filterType));
  });


  if (loading) {
    return (
      <div className="text-center text-gray-600">Cargando tipos de SUDS...</div>
    );
  }

  return (
    <div className="p-4 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-2 flex justify-between items-center">
        Tipos de SUDS y elementos auxiliares
        {canEdit && (
          <button
            onClick={() => setShowAddSudsForm(!showAddSudsForm)}
            className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors shadow-md text-xl leading-none"
            title={showAddSudsForm ? "Ocultar formulario" : "Añadir nuevo tipo de SUDS"}
          >
            {showAddSudsForm ? '−' : '+'}
          </button>
        )}
      </h2>

      {canEdit && showAddSudsForm && (
        <div className="mb-8 p-6 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="text-xl font-semibold text-blue-800 mb-4">{editingSudsId ? 'Editar Tipo de SUDS' : 'Añadir Nuevo Tipo de SUDS'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="sudsName" className="block text-sm font-medium text-gray-700 mb-1">Nombre del SUDS</label>
              <input
                type="text"
                id="sudsName"
                value={newSudsName}
                onChange={(e) => setNewSudsName(e.target.value)}
                placeholder="Ej: Zanja de infiltración"
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                disabled={!canEdit}
              />
            </div>
            <div>
              <label htmlFor="sudsDescription" className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
              <div className="flex items-center space-x-2">
                <textarea
                  id="sudsDescription"
                  value={newSudsDescription}
                  onChange={(e) => setNewSudsDescription(e.target.value)}
                  placeholder="Descripción detallada del tipo de SUDS..."
                  rows="3"
                  className="flex-grow p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  disabled={!canEdit}
                ></textarea>
                <button
                  onClick={handleGenerateSudsDescription}
                  disabled={generatingDescription || !canEdit}
                  className="p-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Generar descripción con IA"
                >
                  {generatingDescription ? 'Generando...' : '✨ Generar'}
                </button>
              </div>
            </div>
            <div className="md:col-span-2">
              <label htmlFor="sudsImageUrl" className="block text-sm font-medium text-gray-700 mb-1">URL de Imagen (opcional)</label>
              <input
                type="url"
                id="sudsImageUrl"
                value={newSudsImageUrl}
                onChange={(e) => setNewSudsImageUrl(e.target.value)}
                placeholder="https://placehold.co/300x200/cccccc/ffffff?text=SUDS"
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                disabled={!canEdit}
              />
              <p className="text-xs text-gray-500 mt-1">Introduce una URL de imagen. Solo se admite una imagen por ahora.</p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Ubicación:</label>
              <div className="flex flex-wrap gap-2">
                {locationTypeOptions.map(option => (
                  <button
                    key={option.id}
                    onClick={() => handleToggleLocationType(option.id)}
                    className={`flex items-center justify-center p-2 rounded-md border transition-all duration-200
                      ${newSudsLocationTypes.includes(option.id)
                        ? 'bg-blue-500 text-white border-blue-600 shadow-md'
                        : 'bg-gray-200 text-gray-700 border-gray-300 hover:bg-blue-100'
                      }`}
                    title={option.name}
                    disabled={!canEdit}
                  >
                    {option.icon.startsWith('http') ? (
                      <img src={option.icon} alt={option.name} className="h-6 w-6 object-contain" onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/24x24/cccccc/ffffff?text=?`; }} />
                    ) : (
                      <span className="text-xl">{option.icon}</span>
                    )}
                    <span className="ml-2 text-sm">{option.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end space-x-2">
            <button
              onClick={handleAddOrUpdateSuds}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!canEdit}
            >
              {editingSudsId ? 'Guardar Cambios' : 'Añadir SUDS'}
            </button>
            {editingSudsId && (
              <button
                onClick={() => {
                  setNewSudsName('');
                  setNewSudsDescription('');
                  setNewSudsImageUrl('');
                  setNewSudsLocationTypes([]);
                  setEditingSudsId(null);
                  setShowAddSudsForm(false);
                }}
                className="px-6 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400 transition-colors shadow-md"
                disabled={!canEdit}
              >
                Cancelar Edición
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mb-8 p-4 bg-gray-100 rounded-lg border border-gray-200">
        <h3 className="text-xl font-semibold text-gray-800 mb-3">Filtrar Tipos de SUDS y elementos auxiliares</h3>
        <div className="flex flex-wrap gap-2">
          {locationTypeOptions.map(option => (
            <button
              key={`filter-${option.id}`}
              onClick={() => handleToggleFilterLocationType(option.id)}
              className={`flex items-center justify-center p-2 rounded-md border transition-all duration-200
                ${filterLocationTypes.includes(option.id)
                  ? 'bg-green-500 text-white border-green-600 shadow-md'
                  : 'bg-gray-200 text-gray-700 border-gray-300 hover:bg-green-100'
                }`}
              title={`Filtrar por: ${option.name}`}
            >
              {option.icon.startsWith('http') ? (
                <img src={option.icon} alt={option.name} className="h-6 w-6 object-contain" onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/24x24/cccccc/ffffff?text=?`; }} />
                    ) : (
                      <span className="text-xl">{option.icon}</span>
                    )}
                    <span className="ml-2 text-sm">{option.name}</span>
                  </button>
                ))}
                {filterLocationTypes.length > 0 && (
                  <button
                    onClick={() => setFilterLocationTypes([])}
                    className="p-2 rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors text-sm shadow-md"
                  >
                    Limpiar Filtros
                  </button>
                )}
              </div>
            </div>


            <div>
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Tipos de SUDS y elementos auxiliares existentes</h3>
              {filteredSudsTypes.length === 0 ? (
                <p className="text-gray-600">No hay tipos de SUDS definidos aún o no coinciden con los filtros. {canEdit && '¡Añade uno!'}</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredSudsTypes.map((suds) => (
                    <div key={suds.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col">
                      {suds.imageUrls && suds.imageUrls.length > 0 && (
                        <img
                          src={suds.imageUrls[0]}
                          alt={`Imagen de ${suds.name}`}
                          className="w-full h-40 object-cover rounded-md mb-4 border border-gray-300"
                          onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/300x200/cccccc/ffffff?text=SUDS`; }}
                        />
                      )}
                      <h4 className="text-lg font-bold text-gray-900 mb-2">{suds.name}</h4>
                      <p className="text-gray-700 text-sm flex-grow mb-4">{suds.description}</p>
                      {suds.locationTypes && suds.locationTypes.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {locationTypeOptions.map(option =>
                            suds.locationTypes.includes(option.id) && (
                              <span key={option.id} className="flex items-center text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                                {option.icon.startsWith('http') ? (
                                  <img src={option.icon} alt={option.name} className="h-4 w-4 object-contain mr-1" onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/16x16/cccccc/ffffff?text=?`; }} />
                                ) : (
                                  <span className="mr-1">{option.icon}</span>
                                )}
                                {option.name}
                              </span>
                            )
                          )}
                        </div>
                      )}
                      {canEdit && (
                        <div className="flex justify-end space-x-2 mt-auto">
                          <button
                            onClick={() => handleEditSuds(suds)}
                            className="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 transition-colors text-sm"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeleteSuds(suds.id)}
                            className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors text-sm"
                          >
                            Eliminar
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      };

      // --- Tab 2: Contratos de mantenimiento ---
      const ContractsTab = () => {
        const { db, userId, userRole, appId, showCustomModal, ROLES } = useAppContext();
        const [contracts, setContracts] = useState([]);
        const [newContractName, setNewContractName] = useState('');
        const [newContractSummary, setNewContractSummary] = useState('');
        const [newContractResponsible, setNewContractResponsible] = useState('');
        const [newContractLogoUrl, setNewContractLogoUrl] = useState('');
        const [editingContractId, setEditingContractId] = useState(null);
        const [loading, setLoading] = useState(true);
        const [showAddContractForm, setShowAddContractForm] = useState(false);

        const canEdit = userRole === ROLES.MASTER || userRole === ROLES.CONTRACT_MANAGER;

        useEffect(() => {
          if (!db || !appId) return;

          const q = collection(db, `artifacts/${appId}/public/data/contracts`);
          const unsubscribe = onSnapshot(q, (snapshot) => {
            const contractsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setContracts(contractsData);
            setLoading(false);
          }, (error) => {
            console.error("Error fetching contracts:", error);
            showCustomModal(`Error al cargar contratos: ${error.message}`);
            setLoading(false);
          });

          return () => unsubscribe();
        }, [db, appId, showCustomModal]);

        const handleAddOrUpdateContract = async () => {
          if (!canEdit) return;
          if (!newContractName.trim() || !newContractSummary.trim() || !newContractResponsible.trim()) {
            showCustomModal("Por favor, rellena todos los campos del contrato.");
            return;
          }

          try {
            const contractData = {
              name: newContractName.trim(),
              summary: newContractSummary.trim(),
              responsible: newContractResponsible.trim(),
              logoUrl: newContractLogoUrl.trim(),
              lastUpdatedBy: userId,
              timestamp: new Date(),
            };

            if (editingContractId) {
              await updateDoc(doc(db, `artifacts/${appId}/public/data/contracts`, editingContractId), contractData);
              showCustomModal("Contrato actualizado con éxito.");
            } else {
              await addDoc(collection(db, `artifacts/${appId}/public/data/contracts`), contractData);
              showCustomModal("Nuevo contrato añadido con éxito.");
            }
            setNewContractName('');
            setNewContractSummary('');
            setNewContractResponsible('');
            setNewContractLogoUrl('');
            setEditingContractId(null);
            setShowAddContractForm(false);
          } catch (error) {
            console.error("Error adding/updating contract:", error);
            showCustomModal(`Error al guardar contrato: ${error.message}`);
          }
        };

        const handleEditContract = (contract) => {
          if (!canEdit) return;
          setNewContractName(contract.name);
          setNewContractSummary(contract.summary);
          setNewContractResponsible(contract.responsible);
          setNewContractLogoUrl(contract.logoUrl || '');
          setEditingContractId(contract.id);
          setShowAddContractForm(true);
        };

        const handleDeleteContract = async (id) => {
          if (!canEdit) return;
          showCustomModal(
            "¿Estás seguro de que quieres eliminar este contrato? Esto también afectará a las actividades asociadas.",
            async () => {
              try {
                await deleteDoc(doc(db, `artifacts/${appId}/public/data/contracts`, id));
                showCustomModal("Contrato eliminado con éxito.");
              } catch (error) {
                console.error("Error deleting contract:", error);
                showCustomModal(`Error al eliminar contrato: ${error.message}`);
              }
            },
            true
          );
        };

        if (loading) {
          return <div className="text-center text-gray-600">Cargando contratos...</div>;
        }

        return (
          <div className="p-4 bg-white rounded-lg shadow-md">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-2 flex justify-between items-center">
              Contratos de mantenimiento
              {canEdit && (
                <button
                  onClick={() => setShowAddContractForm(!showAddContractForm)}
                  className="p-2 bg-green-600 text-white rounded-full hover:bg-green-700 transition-colors shadow-md text-xl leading-none"
                  title={showAddContractForm ? 'Ocultar formulario' : 'Añadir nuevo contrato'}
                >
                  {showAddContractForm ? '−' : '+'}
                </button>
              )}
            </h2>

            {canEdit && showAddContractForm && (
              <div className="mb-8 p-6 bg-green-50 rounded-lg border border-green-200">
                <h3 className="text-xl font-semibold text-green-800 mb-4">{editingContractId ? 'Editar Contrato' : 'Añadir Nuevo Contrato'}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label htmlFor="contractName" className="block text-sm font-medium text-gray-700 mb-1">Nombre del Contrato</label>
                    <input
                      type="text"
                      id="contractName"
                      value={newContractName}
                      onChange={(e) => setNewContractName(e.target.value)}
                      placeholder="Ej: Conservación del viario"
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
                      disabled={!canEdit}
                    />
                  </div>
                  <div>
                    <label htmlFor="contractResponsible" className="block text-sm font-medium text-gray-700 mb-1">Responsable</label>
                    <input
                      type="text"
                      id="contractResponsible"
                      value={newContractResponsible}
                      onChange={(e) => setNewContractResponsible(e.target.value)}
                      placeholder="Nombre del responsable o ID de usuario"
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor="contractSummary" className="block text-sm font-medium text-gray-700 mb-1">Resumen</label>
                    <textarea
                      id="contractSummary"
                      value={newContractSummary}
                      onChange={(e) => setNewContractSummary(e.target.value)}
                      placeholder="Resumen del contrato, alcance, etc."
                      rows="3"
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
                      disabled={!canEdit}
                    ></textarea>
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor="contractLogoUrl" className="block text-sm font-medium text-gray-700 mb-1">URL del Logo (opcional)</label>
                    <input
                      type="url"
                      id="contractLogoUrl"
                      value={newContractLogoUrl}
                      onChange={(e) => setNewContractLogoUrl(e.target.value)}
                      placeholder="Ej: https://ejemplo.com/logo.png"
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
                      disabled={!canEdit}
                    />
                    <p className="text-xs text-gray-500 mt-1">Introduce una URL de imagen para el logo del contrato.</p>
                  </div>
                </div>
                <div className="flex justify-end space-x-2">
                  <button
                    onClick={handleAddOrUpdateContract}
                    className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!canEdit}
                  >
                    {editingContractId ? 'Guardar Cambios' : 'Añadir Contrato'}
                  </button>
                  {editingContractId && (
                    <button
                      onClick={() => {
                        setNewContractName('');
                        setNewContractSummary('');
                        setNewContractResponsible('');
                        setNewContractLogoUrl('');
                        setEditingContractId(null);
                        setShowAddContractForm(false);
                      }}
                      className="px-6 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400 transition-colors shadow-md"
                      disabled={!canEdit}
                    >
                      Cancelar Edición
                    </button>
                  )}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Contratos existentes</h3>
              {contracts.length === 0 ? (
                <p className="text-gray-600">No hay contratos definidos aún. {canEdit && '¡Añade uno!'}</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                  {contracts.map((contract) => (
                    <div key={contract.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col">
                      <h4 className="text-lg font-bold text-gray-900 mb-2">{contract.name}</h4>
                      {contract.logoUrl && (
                        <img
                          src={contract.logoUrl}
                          alt={`Logo del contrato ${contract.name}`}
                          className="w-16 h-16 object-contain rounded-md mb-2"
                          onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/64x64/cccccc/ffffff?text=Logo`; }}
                        />
                      )}
                      <p className="text-gray-700 text-sm mb-2"><span className="font-semibold">Responsable:</span> {contract.responsible}</p>
                      <p className="text-gray-700 text-sm flex-grow mb-4">{contract.summary}</p>
                      {canEdit && (
                        <div className="flex justify-end space-x-2 mt-auto">
                          <button
                            onClick={() => handleEditContract(contract)}
                            className="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 transition-colors text-sm"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeleteContract(contract.id)}
                            className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors text-sm"
                          >
                            Eliminar
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      };

      // Helper to generate allActivitiesFlat (can be used in multiple components)
      const generateAllActivitiesFlat = (sudsTypes, categories, definedActivityNames) => {
        const allPossibleActivities = [];
        sudsTypes.forEach(suds => {
          categories.forEach(category => {
            (definedActivityNames[category] || []).forEach(activityName => {
              allPossibleActivities.push({
                id: `${suds.id}-${category}-${activityName}`,
                sudsId: suds.id,
                sudsName: suds.name,
                category: category,
                activityName: activityName,
              });
            });
          });
        });
        return allPossibleActivities;
      };

      // --- New Tab 3: Definición de Actividades por SUDS ---
      const SudsActivityDefinitionTab = () => {
        const { db, userId, appId, showCustomModal, handleMoveSudsType, handleMoveActivityColumn, userRole, ROLES } = useAppContext();
        const [sudsTypes, setSudsTypes] = useState([]);
        const [maintenanceActivities, setMaintenanceActivities] = useState([]);
        const [categories, setCategories] = useState(['Limpieza', 'Vegetación', 'Estructura', 'Hidráulica', 'Otros']);
        const [newCategoryName, setNewCategoryName] = useState('');
        const [newActivityInput, setNewActivityInput] = useState('');
        const [showAddActivityInput, setShowAddActivityInput] = useState({});
        const [definedActivityNames, setDefinedActivityNames] = useState({});
        const [loading, setLoading] = useState(true);

        // State for editing activity name
        const [editingActivityNameId, setEditingActivityNameId] = useState(null);
        const [editingActivityNameValue, setEditingActivityNameValue] = useState('');
        const [editingActivityNameCategory, setEditingActivityNameCategory] = useState('');

        // State for activity dependencies
        const [showDependenciesModal, setShowDependenciesModal] = useState(false);
        const [currentActivityForDependencies, setCurrentActivityForDependencies] = useState(null); // { sudsId, activityName, category }
        const [selectedDependencies, setSelectedDependencies] = useState([]); // List of dependent activity IDs

        const canEdit = userRole === ROLES.MASTER || userRole === ROLES.SUDS_SPECIALIST;

        const locationTypeOptions = [
          { id: 'acera', name: 'SUDS en acera', icon: '🚶‍♀️' },
          { id: 'zona_verde', name: 'SUDS en zona verde', icon: '🌳' },
          { id: 'viario', name: 'SUDS en viario', icon: '🚗' },
          { id: 'infraestructura', name: 'Elementos Auxiliares', icon: 'https://img.freepik.com/vector-premium/icono-tuberia-fontanero-vector-simple-servicio-agua-tubo-aguas-residuales_98396-55465.jpg' },
        ];

        useEffect(() => {
          if (!db || !appId) return;

          const fetchInitialData = async () => {
            try {
              // Listen for SUDS Types (ordered by 'order' field)
              const sudsRef = collection(db, `artifacts/${appId}/public/data/sudsTypes`);
              const unsubscribeSuds = onSnapshot(sudsRef, (snapshot) => {
                const fetchedSudsTypes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                // Ensure 'order' field exists for all SUDS types, assign if missing
                const sudsTypesWithOrder = fetchedSudsTypes.map((suds, index) => {
                  if (suds.order === undefined) {
                    return { ...suds, order: index };
                  }
                  return suds;
                });
                setSudsTypes(sudsTypesWithOrder.sort((a, b) => (a.order || 0) - (b.order || 0)));
                setLoading(false);
              }, (error) => {
                console.error("Error fetching SUDS types:", error);
                showCustomModal(`Error al cargar tipos de SUDS: ${error.message}`);
                setLoading(false);
              });


              // Listen for Maintenance Activities (simplified for this tab)
              const activitiesRef = collection(db, `artifacts/${appId}/public/data/maintenanceActivities`);
              const unsubscribeActivities = onSnapshot(activitiesRef, (snapshot) => {
                const activitiesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setMaintenanceActivities(activitiesData);
              }, (error) => {
                console.error("Error fetching maintenance activities:", error);
                showCustomModal(`Error al cargar actividades de mantenimiento: ${error.message}`);
              });

              // Listen for categories
              const categoriesRef = doc(db, `artifacts/${appId}/public/data/appSettings`, 'maintenanceCategories');
              const unsubscribeCategories = onSnapshot(categoriesRef, (docSnap) => {
                if (docSnap.exists() && docSnap.data().categories) {
                  setCategories(docSnap.data().categories);
                }
              });

              // Listen for defined activity names
              const definedActivitiesRef = doc(db, `artifacts/${appId}/public/data/appSettings`, 'definedActivityNames');
              const unsubscribeDefinedActivities = onSnapshot(definedActivitiesRef, (docSnap) => {
                if (docSnap.exists() && docSnap.data()) {
                  setDefinedActivityNames(docSnap.data());
                } else {
                  setDefinedActivityNames({});
                }
              });

              return () => {
                unsubscribeSuds();
                unsubscribeActivities();
                unsubscribeCategories();
                unsubscribeDefinedActivities();
              };

            } catch (error) {
              console.error("Error fetching initial data for activities tab:", error);
              showCustomModal(`Error al cargar datos iniciales: ${error.message}`);
              setLoading(false);
            }
          };

          fetchInitialData();
        }, [db, appId, showCustomModal]);

        const handleToggleActivityApplies = async (sudsId, activityName, category) => {
          if (!canEdit) return;
          const existingActivity = maintenanceActivities.find(
            (act) => act.sudsTypeId === sudsId && act.activityName === activityName && act.category === category
          );

          const newAppliesStatus = !existingActivity?.applies;

          const activityData = {
            sudsTypeId: sudsId,
            activityName: activityName,
            category: category,
            applies: newAppliesStatus,
            lastUpdatedBy: userId,
            timestamp: new Date(),
            ...(existingActivity ? {
              status: existingActivity.status || '',
              comment: existingActivity.comment || '',
              involvedContracts: existingActivity.involvedContracts || [],
              frequency: existingActivity.frequency || '',
              validationStatus: existingActivity.validationStatus || 'pendiente',
              validatorComment: existingActivity.validatorComment || '',
              validatedBy: existingActivity.validatedBy || '',
              dependentActivities: existingActivity.dependentActivities || [],
            } : {}),
          };


          try {
            if (existingActivity) {
              await updateDoc(doc(db, `artifacts/${appId}/public/data/maintenanceActivities`, existingActivity.id), activityData);
            } else {
              await addDoc(collection(db, `artifacts/${appId}/public/data/maintenanceActivities`), activityData);
            }
          } catch (error) {
            console.error("Error updating activity applies status:", error);
            showCustomModal(`Error al guardar el estado de aplicación: ${error.message}`);
          }
        };

        const handleSaveNewActivity = async (category) => {
          if (!canEdit) return;
          if (!newActivityInput.trim()) {
            showCustomModal("Por favor, introduce un nombre para la nueva actividad.");
            return;
          }

          const trimmedName = newActivityInput.trim().charAt(0).toUpperCase() + newActivityInput.trim().slice(1).toLowerCase();
          const currentCategoryActivities = definedActivityNames[category] || [];

          if (currentCategoryActivities.includes(trimmedName)) {
            showCustomModal(`La actividad "${trimmedName}" ya existe en la categoría "${category}".`);
            return;
          }

          const updatedDefinedActivities = {
            ...definedActivityNames,
            [category]: [...currentCategoryActivities, trimmedName]
          };

          try {
            await setDoc(doc(db, `artifacts/${appId}/public/data/appSettings`, 'definedActivityNames'), updatedDefinedActivities);
            showCustomModal(`Actividad "${trimmedName}" añadida a la categoría "${category}".`);
            setNewActivityInput('');
            setShowAddActivityInput({ ...showAddActivityInput, [category]: false });
          } catch (error) {
            console.error("Error adding new activity name:", error);
            showCustomModal(`Error al añadir la actividad: ${error.message}`);
          }
        };

        const handleDeleteActivityColumn = async (category, activityName) => {
          if (!canEdit) return;
          showCustomModal(
            `¿Estás seguro de que quieres eliminar la actividad "${activityName}" de la categoría "${category}"? Esto eliminará todos los datos asociados a esta actividad.`,
            async () => {
              try {
                const currentCategoryActivities = definedActivityNames[category] || [];
                const updatedCategoryActivities = currentCategoryActivities.filter(name => name !== activityName);
                const updatedDefinedActivities = {
                  ...definedActivityNames,
                  [category]: updatedCategoryActivities
                };
                await setDoc(doc(db, `artifacts/${appId}/public/data/appSettings`, 'definedActivityNames'), updatedDefinedActivities);

                const q = query(collection(db, `artifacts/${appId}/public/data/maintenanceActivities`),
                  where("category", "==", category),
                  where("activityName", "==", activityName)
                );
                const snapshot = await getDocs(q);
                const batch = writeBatch(db);
                snapshot.docs.forEach(doc => {
                  batch.delete(doc.ref);
                });
                await batch.commit();

                showCustomModal(`Actividad "${activityName}" eliminada con éxito.`);
              } catch (error) {
                console.error("Error deleting activity column:", error);
                showCustomModal(`Error al eliminar la actividad: ${error.message}`);
              }
            },
            true
          );
        };

        const handleAddCategory = async () => {
          if (!canEdit) return;
          if (!newCategoryName.trim()) {
            showCustomModal("Por favor, introduce un nombre para la nueva categoría.");
            return;
          }
          const updatedCategories = [...categories, newCategoryName.trim()];
          try {
            await setDoc(doc(db, `artifacts/${appId}/public/data/appSettings`, 'maintenanceCategories'), { categories: updatedCategories });
            setNewCategoryName('');
            showCustomModal("Nueva categoría añadida.");
          } catch (error) {
            console.error("Error adding new category:", error);
            showCustomModal(`Error al añadir categoría: ${error.message}`);
          }
        };

        const handleMoveCategory = async (categoryToMove, direction) => {
          if (!canEdit) return;
          const currentIndex = categories.indexOf(categoryToMove);
          const newCategories = [...categories];

          if (direction === 'up' && currentIndex > 0) {
            [newCategories[currentIndex - 1], newCategories[currentIndex]] = [newCategories[currentIndex], newCategories[currentIndex - 1]];
          } else if (direction === 'down' && currentIndex < newCategories.length - 1) {
            [newCategories[currentIndex + 1], newCategories[currentIndex]] = [newCategories[currentIndex], newCategories[currentIndex + 1]];
          } else {
            return;
          }

          try {
            await setDoc(doc(db, `artifacts/${appId}/public/data/appSettings`, 'maintenanceCategories'), { categories: newCategories });
            showCustomModal(`Categoría "${categoryToMove}" movida.`);
          } catch (error) {
            console.error("Error moving category:", error);
            showCustomModal(`Error al mover la categoría: ${error.message}`);
          }
        };

        const handleDeleteCategory = async (categoryToDelete) => {
          if (!canEdit) return;
          const hasDefinedActivities = (definedActivityNames[categoryToDelete] && definedActivityNames[categoryToDelete].length > 0);
          const q = query(collection(db, `artifacts/${appId}/public/data/maintenanceActivities`), where("category", "==", categoryToDelete));
          const activityDocs = await getDocs(q);
          const hasMaintenanceRecords = !activityDocs.empty;

          if (hasDefinedActivities || hasMaintenanceRecords) {
            showCustomModal(
              `La categoría "${categoryToDelete}" contiene actividades o registros de mantenimiento. ¿Estás seguro de que quieres eliminarla? Esto eliminará PERMANENTEMENTE todos los datos asociados a esta categoría.`,
              async () => {
                try {
                  const updatedCategories = categories.filter(cat => cat !== categoryToDelete);
                  await setDoc(doc(db, `artifacts/${appId}/public/data/appSettings`, 'maintenanceCategories'), { categories: updatedCategories });

                  const updatedDefinedActivities = { ...definedActivityNames };
                  delete updatedDefinedActivities[categoryToDelete];
                  await setDoc(doc(db, `artifacts/${appId}/public/data/appSettings`, 'definedActivityNames'), updatedDefinedActivities);

                  const batch = writeBatch(db);
                  activityDocs.docs.forEach(doc => {
                    batch.delete(doc.ref);
                  });
                  await batch.commit();

                  showCustomModal(`Categoría "${categoryToDelete}" y todos sus datos asociados eliminados con éxito.`);
                } catch (error) {
                  console.error("Error deleting category:", error);
                  showCustomModal(`Error al eliminar la categoría: ${error.message}`);
                }
              },
              true
            );
          } else {
            showCustomModal(
              `¿Estás seguro de que quieres eliminar la categoría "${categoryToDelete}"?`,
              async () => {
                try {
                  const updatedCategories = categories.filter(cat => cat !== categoryToDelete);
                  await setDoc(doc(db, `artifacts/${appId}/public/data/appSettings`, 'maintenanceCategories'), { categories: updatedCategories });
                  showCustomModal(`Categoría "${categoryToDelete}" eliminada con éxito.`);
                } catch (error) {
                  console.error("Error deleting category:", error);
                  showCustomModal(`Error al eliminar la categoría: ${error.message}`);
                }
              },
              true
            );
          }
        };

        // --- Activity Name Editing ---
        const handleEditActivityNameStart = (category, activityName) => {
          if (!canEdit) return;
          setEditingActivityNameCategory(category);
          setEditingActivityNameId(activityName);
          setEditingActivityNameValue(activityName);
        };

        const handleEditActivityNameSave = async () => {
          if (!canEdit) return;
          if (!editingActivityNameValue.trim()) {
            showCustomModal("El nombre de la actividad no puede estar vacío.");
            return;
          }
          const trimmedNewName = editingActivityNameValue.trim().charAt(0).toUpperCase() + editingActivityNameValue.trim().slice(1).toLowerCase();

          if (trimmedNewName === editingActivityNameId) {
            setEditingActivityNameId(null);
            return;
          }

          const currentCategoryActivities = definedActivityNames[editingActivityNameCategory] || [];
          if (currentCategoryActivities.includes(trimmedNewName)) {
            showCustomModal(`La actividad "${trimmedNewName}" ya existe en la categoría "${editingActivityNameCategory}".`);
            return;
          }

          showCustomModal(
            `¿Estás seguro de que quieres renombrar "${editingActivityNameId}" a "${trimmedNewName}"? Esto actualizará todos los registros asociados.`,
            async () => {
              try {
                const updatedCategoryActivities = currentCategoryActivities.map(name =>
                  name === editingActivityNameId ? trimmedNewName : name
                );
                const updatedDefinedActivities = {
                  ...definedActivityNames,
                  [editingActivityNameCategory]: updatedCategoryActivities
                };
                await setDoc(doc(db, `artifacts/${appId}/public/data/appSettings`, 'definedActivityNames'), updatedDefinedActivities);

                const q = query(collection(db, `artifacts/${appId}/public/data/maintenanceActivities`),
                  where("category", "==", editingActivityNameCategory),
                  where("activityName", "==", editingActivityNameId)
                );
                const snapshot = await getDocs(q);
                const batch = writeBatch(db);
                snapshot.docs.forEach(docSnap => {
                  batch.update(docSnap.ref, { activityName: trimmedNewName });
                });
                await batch.commit();

                showCustomModal("Nombre de actividad actualizado con éxito.");
                setEditingActivityNameId(null);
              } catch (error) {
                console.error("Error during activity rename operation:", error);
                showCustomModal(`Error al renombrar la actividad: ${error.message}`);
                setEditingActivityNameId(null);
              }
            },
            true,
            () => {
              setEditingActivityNameId(null);
            }
          );
        };

        // --- Activity Dependencies ---
        const handleOpenDependenciesModal = (sudsId, activityName, category) => {
          if (!canEdit) return;
          const activity = maintenanceActivities.find(
            (act) => act.sudsTypeId === sudsId && act.activityName === activityName && act.category === category
          );
          setCurrentActivityForDependencies({ sudsId, activityName, category, id: activity?.id });
          setSelectedDependencies(activity?.dependentActivities || []);
          setShowDependenciesModal(true);
        };

        const handleToggleDependency = (dependentActivityId) => {
          if (!canEdit) return;
          setSelectedDependencies(prev =>
            prev.includes(dependentActivityId)
              ? prev.filter(id => id !== dependentActivityId)
              : [...prev, dependentActivityId]
          );
        };

        const handleSaveDependencies = async () => {
          if (!canEdit) return;
          if (!currentActivityForDependencies) return;

          const { sudsId, activityName, category, id } = currentActivityForDependencies;

          try {
            const batch = writeBatch(db);

            const primaryActivityRef = id ? doc(db, `artifacts/${appId}/public/data/maintenanceActivities`, id) : null;
            if (primaryActivityRef) {
              batch.update(primaryActivityRef, {
                dependentActivities: selectedDependencies,
                lastUpdatedBy: userId,
                timestamp: new Date(),
              });
            } else {
              const newPrimaryActivityData = {
                sudsTypeId: sudsId,
                activityName: activityName,
                category: category,
                applies: true,
                dependentActivities: selectedDependencies,
                lastUpdatedBy: userId,
                timestamp: new Date(),
                status: '', comment: '', involvedContracts: [], frequency: '',
                validationStatus: 'pendiente', validatorComment: '', validatedBy: '',
              };
              batch.set(doc(collection(db, `artifacts/${appId}/public/data/maintenanceActivities`)), newPrimaryActivityData);
            }

            for (const depId of selectedDependencies) {
              const dependentActivity = maintenanceActivities.find(act => act.id === depId);
              if (dependentActivity && !dependentActivity.applies) {
                const depRef = doc(db, `artifacts/${appId}/public/data/maintenanceActivities`, depId);
                batch.update(depRef, { applies: true, lastUpdatedBy: userId, timestamp: new Date() });
              } else if (!dependentActivity) {
                const parts = depId.split('-');
                if (parts.length === 3) {
                  const [depSudsId, depCategory, depActivityName] = parts;
                  const newDependentActivityData = {
                    sudsTypeId: depSudsId,
                    activityName: depActivityName,
                    category: depCategory,
                    applies: true,
                    dependentActivities: [],
                    lastUpdatedBy: userId,
                    timestamp: new Date(),
                    status: '', comment: '', involvedContracts: [], frequency: '',
                    validationStatus: 'pendiente', validatorComment: '', validatedBy: '',
                  };
                  batch.set(doc(collection(db, `artifacts/${appId}/public/data/maintenanceActivities`)), newDependentActivityData);
                }
              }
            }

            await batch.commit();
            showCustomModal("Dependencias de actividad guardadas con éxito.");
            setShowDependenciesModal(false);
            setCurrentActivityForDependencies(null);
            setSelectedDependencies([]);
          } catch (error) {
            console.error("Error saving dependencies:", error);
            showCustomModal(`Error al guardar las dependencias: ${error.message}`);
          }
        };


        const activityNamesByCategory = categories.reduce((acc, cat) => {
          let names = definedActivityNames[cat] || [];
          maintenanceActivities
            .filter(act => act.category === cat && !names.includes(act.activityName))
            .forEach(act => names.push(act.activityName));

          acc[cat] = names;
          return acc;
        }, {});


        const allActivitiesFlat = generateAllActivitiesFlat(sudsTypes, categories, definedActivityNames);


        if (loading) {
          return <div className="text-center text-gray-600">Cargando datos de actividades...</div>;
        }

        return (
          <div className="p-4 bg-white rounded-lg shadow-md">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-2">Definición de Actividades por SUDS</h2>

            {canEdit && (
              <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-200 flex flex-col md:flex-row items-center gap-4">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Nueva categoría de mantenimiento"
                  className="flex-grow p-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                  disabled={!canEdit}
                />
                <button
                  onClick={handleAddCategory}
                  className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors shadow-md w-full md:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!canEdit}
                >
                  Añadir Categoría
                </button>
              </div>
            )}

            {categories.map((category, index) => (
              <div key={category} className="mb-10">
                <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center justify-between">
                  <div className="flex items-center">
                    <span>{category}</span>
                    {canEdit && (
                      <div className="ml-4 flex space-x-2">
                        <button
                          onClick={() => handleMoveCategory(category, 'up')}
                          disabled={index === 0 || !canEdit}
                          className="p-1 text-gray-600 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Mover categoría arriba"
                        >
                          ⬆️
                        </button>
                        <button
                          onClick={() => handleMoveCategory(category, 'down')}
                          disabled={index === categories.length - 1 || !canEdit}
                          className="p-1 text-gray-600 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Mover categoría abajo"
                        >
                          ⬇️
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(category)}
                          className="p-1 text-red-500 hover:text-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={`Eliminar categoría "${category}"`}
                          disabled={!canEdit}
                        >
                          🗑️
                        </button>
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => setShowAddActivityInput(prev => ({ ...prev, [category]: !prev[category] }))}
                      className="ml-4 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      title={showAddActivityInput[category] ? "Ocultar entrada de actividad" : "Añadir nueva actividad"}
                      disabled={!canEdit}
                    >
                      {showAddActivityInput[category] ? '−' : '+'} Añadir Actividad
                    </button>
                  )}
                </h3>

                {canEdit && showAddActivityInput[category] && (
                  <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200 flex flex-col md:flex-row items-center gap-4">
                    <input
                      type="text"
                      value={newActivityInput}
                      onChange={(e) => setNewActivityInput(e.target.value)}
                      placeholder="Nombre de la nueva actividad"
                      className="flex-grow p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      disabled={!canEdit}
                    />
                    <button
                      onClick={() => handleSaveNewActivity(category)}
                      className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-md w-full md:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={!canEdit}
                    >
                      Guardar Actividad
                    </button>
                  </div>
                )}

                <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">Tipo de SUDS</th>
                        {activityNamesByCategory[category].map((activityName) => (
                          <th key={`${category}-${activityName}`} className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            <div className="flex flex-col items-center justify-center">
                              <div className="flex items-center justify-center w-full">
                                {/* Left Arrow */}
                                <button
                                  onClick={() => handleMoveActivityColumn(category, activityName, 'left', definedActivityNames)}
                                  disabled={activityNamesByCategory[category].indexOf(activityName) === 0 || !canEdit}
                                  className="p-1 text-gray-600 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Mover actividad a la izquierda"
                                >
                                  ⬅️
                                </button>
                                {editingActivityNameId === activityName && editingActivityNameCategory === category ? (
                                  <input
                                    type="text"
                                    value={editingActivityNameValue}
                                    onChange={(e) => setNewActivityNameValue(e.target.value)}
                                    onBlur={handleEditActivityNameSave}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        handleEditActivityNameSave();
                                      }
                                    }}
                                    className="w-24 p-1 border-2 border-blue-500 rounded-md text-xs text-center focus:outline-none focus:ring-2 focus:ring-blue-600"
                                    disabled={!canEdit}
                                  />
                                ) : (
                                  <span
                                    className={`cursor-pointer hover:text-blue-700 ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    onClick={() => handleEditActivityNameStart(category, activityName)}
                                    title="Editar nombre de actividad"
                                  >
                                    {activityName}
                                  </span>
                                )}
                                {/* Right Arrow */}
                                <button
                                  onClick={() => handleMoveActivityColumn(category, activityName, 'right', definedActivityNames)}
                                  disabled={activityNamesByCategory[category].indexOf(activityName) === activityNamesByCategory[category].length - 1 || !canEdit}
                                  className="p-1 text-gray-600 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Mover actividad a la derecha"
                                >
                                  ➡️
                                </button>
                              </div>
                              {canEdit && (
                                <button
                                  onClick={() => handleDeleteActivityColumn(category, activityName)}
                                  className="mt-1 text-red-500 hover:text-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title={`Eliminar actividad "${activityName}"`}
                                  disabled={!canEdit}
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {sudsTypes.map((suds, sudsIndex) => (
                        <tr key={suds.id}>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white z-10">
                            <div className="flex items-center">
                              {/* Up/Down Arrows for SUDS Types */}
                              <div className="flex flex-col mr-2">
                                <button
                                  onClick={() => handleMoveSudsType(suds.id, 'up', sudsTypes)}
                                  disabled={sudsIndex === 0 || !canEdit}
                                  className="p-0.5 text-gray-600 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Mover tipo de SUDS arriba"
                                >
                                  ⬆️
                                </button>
                                <button
                                  onClick={() => handleMoveSudsType(suds.id, 'down', sudsTypes)}
                                  disabled={sudsIndex === sudsTypes.length - 1 || !canEdit}
                                  className="p-0.5 text-gray-600 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Mover tipo de SUDS abajo"
                                >
                                  ⬇️
                                </button>
                              </div>
                              {suds.name}
                              {suds.locationTypes && suds.locationTypes.length > 0 && (
                                <div className="ml-2 flex gap-1">
                                  {locationTypeOptions.map(option =>
                                    suds.locationTypes.includes(option.id) && (
                                      <span key={option.id} className="text-base" title={option.name}>
                                        {option.icon.startsWith('http') ? (
                                          <img src={option.icon} alt={option.name} className="h-4 w-4 object-contain" onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/16x16/cccccc/ffffff?text=?`; }} />
                                        ) : (
                                          <span className="mr-1">{option.icon}</span>
                                        )}
                                      </span>
                                    )
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          {activityNamesByCategory[category].map((activityName) => {
                            const activity = maintenanceActivities.find(
                              (act) => act.sudsTypeId === suds.id && act.activityName === activityName && act.category === category
                            );
                            const applies = activity?.applies || false;
                            const hasDependencies = activity?.dependentActivities && activity.dependentActivities.length > 0;

                            const cellColorClass = applies ? 'bg-green-100' : 'bg-gray-100';
                            const dependencyButtonClass = hasDependencies ? 'text-blue-600' : 'text-gray-600';
                            const dependencyTooltip = hasDependencies
                              ? `Depende de: ${activity.dependentActivities.map(depId => {
                                  const depAct = allActivitiesFlat.find(a => a.id === depId);
                                  return depAct ? `${depAct.sudsName} - ${depAct.activityName}` : depId;
                                }).join(', ')}`
                              : 'No hay dependencias';

                            return (
                              <td key={`${suds.id}-${activityName}`} className={`p-2 border border-gray-200 ${cellColorClass}`}>
                                <div className="flex items-center justify-center flex-col">
                                  <input
                                    type="checkbox"
                                    checked={applies}
                                    onChange={() => handleToggleActivityApplies(suds.id, activityName, category)}
                                    className="form-checkbox h-5 w-5 text-blue-600 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled={!canEdit}
                                  />
                                  {applies && (
                                    <button
                                      onClick={() => handleOpenDependenciesModal(suds.id, activityName, category)}
                                      className={`mt-1 text-sm ${dependencyButtonClass} hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed`}
                                      title={dependencyTooltip}
                                      disabled={!canEdit}
                                    >
                                      🔗
                                    </button>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {showDependenciesModal && currentActivityForDependencies && (
                  <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full">
                      <h3 className="text-xl font-semibold mb-4">
                        Dependencias para: <br />
                        <span className="text-blue-700">{currentActivityForDependencies.sudsName} - {currentActivityForDependencies.activityName}</span>
                      </h3>
                      <p className="text-sm text-gray-600 mb-4">Selecciona las actividades que se realizan si esta actividad es positiva (ej: una inspección que genera una acción correctiva).</p>
                      <div className="max-h-80 overflow-y-auto mb-4 border rounded-md p-2">
                        {allActivitiesFlat
                          .filter(act =>
                            act.id !== `${currentActivityForDependencies.sudsId}-${currentActivityForDependencies.category}-${currentActivityForDependencies.activityName}` &&
                            act.sudsId === currentActivityForDependencies.sudsId
                          )
                          .map(act => {
                            const isSelected = selectedDependencies.includes(act.id);
                            return (
                              <div key={act.id} className="flex items-center mb-2 p-1 rounded-md hover:bg-gray-100">
                                <input
                                  type="checkbox"
                                  id={`dep-${act.id}`}
                                  checked={isSelected}
                                  onChange={() => handleToggleDependency(act.id)}
                                  className="form-checkbox h-4 w-4 text-blue-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                  disabled={!canEdit}
                                />
                                <label htmlFor={`dep-${act.id}`} className="ml-2 text-sm text-gray-800">
                                  {act.sudsName} - {act.category} - {act.activityName}
                                </label>
                              </div>
                            );
                          })}
                      </div>
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => setShowDependenciesModal(false)}
                          className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleSaveDependencies}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={!canEdit}
                        >
                          Guardar Dependencias
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      };

      // Function to prepare activities for display, including dependencies
      const getDisplayActivities = (sudsId, allMaintenanceActivities, categories, definedActivityNames) => {
        const sudsActivities = allMaintenanceActivities.filter(act => act.sudsTypeId === sudsId && act.applies);
        const activityMap = new Map(sudsActivities.map(act => [act.id, act]));

        const processedActivityIds = new Set();
        const displayedOrder = [];

        const allDependentIds = new Set();
        sudsActivities.forEach(act => {
          if (act.dependentActivities) {
            act.dependentActivities.forEach(depId => allDependentIds.add(depId));
          }
        });

        let topLevelActivities = sudsActivities.filter(act => !allDependentIds.has(act.id));

        topLevelActivities.sort((a, b) => {
          const categoryAIndex = categories.indexOf(a.category);
          const categoryBIndex = categories.indexOf(b.category);

          if (categoryAIndex !== categoryBIndex) {
            return categoryAIndex - categoryBIndex;
          }

          const activityNamesForCategoryA = definedActivityNames[a.category] || [];
          const activityNamesForCategoryB = definedActivityNames[b.category] || [];

          const activityIndexA = activityNamesForCategoryA.indexOf(a.activityName);
          const activityIndexB = activityNamesForCategoryB.indexOf(b.activityName);

          return activityIndexA - activityIndexB;
        });

        const addActivityAndDependents = (activity) => {
          if (processedActivityIds.has(activity.id)) {
            return;
          }

          displayedOrder.push({ ...activity, isDependent: activity.isDependent || false });
          processedActivityIds.add(activity.id);

          const sortedDependents = (activity.dependentActivities || [])
            .map(depId => activityMap.get(depId))
            .filter(Boolean)
            .sort((a, b) => {
              const categoryAIndex = categories.indexOf(a.category);
              const categoryBIndex = categories.indexOf(b.category);

              if (categoryAIndex !== categoryBIndex) {
                return categoryAIndex - categoryBIndex;
              }

              const activityNamesForCategoryA = definedActivityNames[a.category] || [];
              const activityNamesForCategoryB = definedActivityNames[b.category] || [];

              const activityIndexA = activityNamesForCategoryA.indexOf(a.activityName);
              const activityIndexB = activityNamesForCategoryB.indexOf(b.activityName);

              return activityIndexA - activityIndexB;
            });

          sortedDependents.forEach(depAct => {
            addActivityAndDependents({ ...depAct, isDependent: true });
          });
        };

        topLevelActivities.forEach(addActivityAndDependents);

        return displayedOrder;
      };


      // --- New Tab 4: Detalle de Actividades por SUDS ---
      const SudsActivityDetailsTab = () => {
        const { db, userId, appId, showCustomModal, userRole, ROLES } = useAppContext();
        const [sudsTypes, setSudsTypes] = useState([]);
        const [contracts, setContracts] = useState([]);
        const [maintenanceActivities, setMaintenanceActivities] = useState([]);
        const [categories, setCategories] = useState([]);
        const [definedActivityNames, setDefinedActivityNames] = useState({});
        const [loading, setLoading] = useState(true);
        const [filterLocationTypes, setFilterLocationTypes] = useState([]);

        const canEditDetails = userRole === ROLES.MASTER || userRole === ROLES.SUDS_SPECIALIST;

        const locationTypeOptions = [
          { id: 'acera', name: 'SUDS en acera', icon: '🚶‍♀️' },
          { id: 'zona_verde', name: 'SUDS en zona verde', 'icon': '🌳' },
          { id: 'viario', name: 'SUDS en viario', icon: '🚗' },
          { id: 'infraestructura', name: 'Elementos Auxiliares', icon: 'https://img.freepik.com/vector-premium/icono-tuberia-fontanero-vector-simple-servicio-agua-tubo-aguas-residuales_98396-55465.jpg' },
        ];

        useEffect(() => {
          if (!db || !appId) return;

          const fetchInitialData = async () => {
            try {
              const sudsRef = collection(db, `artifacts/${appId}/public/data/sudsTypes`);
              const unsubscribeSuds = onSnapshot(sudsRef, (snapshot) => {
                const fetchedSudsTypes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const sudsTypesWithOrder = fetchedSudsTypes.map((suds, index) => {
                  if (suds.order === undefined) {
                    return { ...suds, order: index };
                  }
                  return suds;
                });
                setSudsTypes(sudsTypesWithOrder.sort((a, b) => (a.order || 0) - (b.order || 0)));
                setLoading(false);
              }, (error) => {
                console.error("Error fetching SUDS types:", error);
                showCustomModal(`Error al cargar tipos de SUDS: ${error.message}`);
                setLoading(false);
              });

              const contractsSnapshot = await getDocs(collection(db, `artifacts/${appId}/public/data/contracts`));
              setContracts(contractsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

              const activitiesRef = collection(db, `artifacts/${appId}/public/data/maintenanceActivities`);
              const unsubscribeActivities = onSnapshot(activitiesRef, (snapshot) => {
                const activitiesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setMaintenanceActivities(activitiesData);
              }, (error) => {
                console.error("Error fetching maintenance activities:", error);
                showCustomModal(`Error al cargar actividades de mantenimiento: ${error.message}`);
              });

              const categoriesRef = doc(db, `artifacts/${appId}/public/data/appSettings`, 'maintenanceCategories');
              const unsubscribeCategories = onSnapshot(categoriesRef, (docSnap) => {
                if (docSnap.exists() && docSnap.data().categories) {
                  setCategories(docSnap.data().categories);
                }
              });

              const definedActivitiesRef = doc(db, `artifacts/${appId}/public/data/appSettings`, 'definedActivityNames');
              const unsubscribeDefinedActivities = onSnapshot(definedActivitiesRef, (docSnap) => {
                if (docSnap.exists() && docSnap.data()) {
                  setDefinedActivityNames(docSnap.data());
                } else {
                  setDefinedActivityNames({});
                }
              });


              return () => {
                unsubscribeSuds();
                unsubscribeActivities();
                unsubscribeCategories();
                unsubscribeDefinedActivities();
              };

            } catch (error) {
              console.error("Error fetching initial data for details tab:", error);
              showCustomModal(`Error al cargar datos iniciales: ${error.message}`);
              setLoading(false);
            }
          };

          fetchInitialData();
        }, [db, appId, showCustomModal]);

        const handleUpdateActivityDetail = async (activityId, field, value) => {
          if (!canEditDetails) return;
          try {
            const activityRef = doc(db, `artifacts/${appId}/public/data/maintenanceActivities`, activityId);
            const activitySnap = await getDoc(activityRef);
            if (!activitySnap.exists()) {
              console.error("Activity document not found:", activityId);
              showCustomModal("Error: Actividad no encontrada.");
              return;
            }

            await updateDoc(activityRef, {
              [field]: value,
              lastUpdatedBy: userId,
              timestamp: new Date(),
              validationStatus: 'pendiente',
            });
          } catch (error) {
            console.error("Error updating activity detail:", error);
            showCustomModal(`Error al guardar el detalle de la actividad: ${error.message}`);
          }
        };

        const handleToggleFilterLocationType = (typeId) => {
          setFilterLocationTypes(prev =>
            prev.includes(typeId) ? prev.filter(id => id !== typeId) : [...prev, typeId]
          );
        };

        if (loading) {
          return <div className="text-center text-gray-600">Cargando detalles de actividades...</div>;
        }

        const allActivitiesFlat = generateAllActivitiesFlat(sudsTypes, categories, definedActivityNames);

        const filteredSudsTypesByLocation = sudsTypes.filter(suds => {
          if (filterLocationTypes.length === 0) return true;
          return filterLocationTypes.some(filterType => suds.locationTypes?.includes(filterType));
        });

        const sudsTypesToDisplay = filteredSudsTypesByLocation.filter(suds =>
          maintenanceActivities.some(act => act.sudsTypeId === suds.id && act.applies)
        );

        return (
          <div className="p-4 bg-white rounded-lg shadow-md">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-2">Detalle de Actividades por SUDS</h2>

            <div className="mb-8 p-4 bg-gray-100 rounded-lg border border-gray-200">
              <h3 className="text-xl font-semibold text-gray-800 mb-3">Filtrar por Tipo de Ubicación</h3>
              <div className="flex flex-wrap gap-2">
                {locationTypeOptions.map(option => (
                  <button
                    key={`filter-${option.id}`}
                    onClick={() => handleToggleFilterLocationType(option.id)}
                    className={`flex items-center justify-center p-2 rounded-md border transition-all duration-200
                      ${filterLocationTypes.includes(option.id)
                        ? 'bg-blue-500 text-white border-blue-600 shadow-md'
                        : 'bg-gray-200 text-gray-700 border-gray-300 hover:bg-blue-100'
                      }`}
                    title={`Filtrar por: ${option.name}`}
                  >
                    {option.icon.startsWith('http') ? (
                      <img src={option.icon} alt={option.name} className="h-6 w-6 object-contain" onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/24x24/cccccc/ffffff?text=?`; }} />
                    ) : (
                      <span className="text-xl">{option.icon}</span>
                    )}
                    <span className="ml-2 text-sm">{option.name}</span>
                  </button>
                ))}
                {filterLocationTypes.length > 0 && (
                  <button
                    onClick={() => setFilterLocationTypes([])}
                    className="p-2 rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors text-sm shadow-md"
                  >
                    Limpiar Filtros
                  </button>
                )}
              </div>
            </div>

            {sudsTypesToDisplay.length === 0 ? (
              <p className="text-gray-600">No hay actividades marcadas como "aplicables" para ningún tipo de SUDS que coincida con los filtros seleccionados. Por favor, ve a la pestaña "Definición de Actividades por SUDS" (Pestaña 3) y marca las actividades que deben aplicarse para cada tipo de SUDS o ajusta tus filtros.</p>
            ) : (
              <div className="space-y-8">
                {sudsTypesToDisplay.map((suds) => {
                  const sudsDisplayActivities = getDisplayActivities(suds.id, maintenanceActivities, categories, definedActivityNames);

                  return (
                    <div key={suds.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm">
                      <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                        {suds.name}
                        {suds.locationTypes && suds.locationTypes.length > 0 && (
                          <div className="ml-2 flex gap-1">
                            {locationTypeOptions.map(option =>
                              suds.locationTypes.includes(option.id) && (
                                <span key={option.id} className="text-base" title={option.name}>
                                  {option.icon.startsWith('http') ? (
                                    <img src={option.icon} alt={option.name} className="h-4 w-4 object-contain" onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/16x16/cccccc/ffffff?text=?`; }} />
                                  ) : (
                                    <span className="mr-1">{option.icon}</span>
                                  )}
                                </span>
                              )
                            )}
                          </div>
                        )}
                        {suds.imageUrls && suds.imageUrls.length > 0 && (
                          <img
                            src={suds.imageUrls[0]}
                            alt={`Imagen de ${suds.name}`}
                            className="w-10 h-10 object-cover rounded-md ml-2"
                            onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/40x40/cccccc/ffffff?text=SUDS`; }}
                          />
                        )}
                      </h3>
                      <p className="text-gray-700 text-sm mb-4 p-2 bg-gray-100 rounded-md">{suds.description}</p>
                      <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/5">Actividad</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado de Contrato</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contratos Asociados</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Frecuencia</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Comentario</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {sudsDisplayActivities.map(activity => {
                              const statusColorClass =
                                activity.status === 'verde' ? 'bg-green-50' :
                                activity.status === 'amarillo' ? 'bg-yellow-50' :
                                activity.status === 'rojo' ? 'bg-red-50' : '';
                              const hasDependencies = activity?.dependentActivities && activity.dependentActivities.length > 0;
                              const dependencyTooltip = hasDependencies
                                ? `Depende de: ${activity.dependentActivities.map(depId => {
                                    const depAct = allActivitiesFlat.find(a => a.id === depId);
                                    return depAct ? `${depAct.sudsName} - ${depAct.activityName}` : depId;
                                  }).join(', ')}`
                                : 'No hay dependencias';
                              const involvedContracts = activity.involvedContracts || [];

                              return (
                                <tr key={activity.id} className={`${statusColorClass}`}>
                                  <td className={`px-4 py-3 text-sm text-gray-800 font-medium whitespace-normal break-words w-1/5 ${activity.isDependent ? 'pl-8 italic text-gray-600' : ''}`}>
                                    <div className="flex items-center">
                                      {activity.isDependent && <span className="mr-2 text-blue-500">↳</span>}
                                      {activity.activityName}
                                    </div>
                                  </td>
                                  <td className={`px-4 py-3 whitespace-nowrap text-sm`}>
                                    {canEditDetails ? (
                                      <select
                                        value={activity.status || ''}
                                        onChange={(e) => handleUpdateActivityDetail(activity.id, 'status', e.target.value)}
                                        className={`w-full p-1 border rounded-md text-sm`}
                                        disabled={!canEditDetails}
                                      >
                                        <option value="">Seleccionar estado</option>
                                        <option value="verde">Incluido en contrato</option>
                                        <option value="amarillo">Fácilmente integrable</option>
                                        <option value="rojo">Actividad específica</option>
                                        <option value="no_aplica">No aplica</option>
                                      </select>
                                    ) : (
                                      <span>
                                        {activity.status === 'verde' ? 'Incluido en contrato' :
                                         activity.status === 'amarillo' ? 'Fácilmente integrable' :
                                         activity.status === 'rojo' ? 'Actividad específica' :
                                         activity.status === 'no_aplica' ? 'No aplica' : 'N/A'}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-sm">
                                    {canEditDetails ? (
                                      <div className="flex flex-wrap gap-1 py-1">
                                        {contracts.map(contract => (
                                          <button
                                            key={contract.id}
                                            onClick={() => {
                                              const newInvolvedContracts = involvedContracts.includes(contract.name)
                                                ? involvedContracts.filter(name => name !== contract.name)
                                                : [...involvedContracts, contract.name];
                                              handleUpdateActivityDetail(activity.id, 'involvedContracts', newInvolvedContracts);
                                            }}
                                            className={`flex flex-col items-center justify-center w-10 h-10 rounded-md text-xs font-medium transition-all duration-200 overflow-hidden
                                              ${involvedContracts.includes(contract.name)
                                                ? 'bg-blue-500 text-white shadow-lg ring-2 ring-blue-700'
                                                : `text-gray-700 hover:bg-gray-400 border border-gray-300`
                                              }`}
                                            title={contract.name}
                                            disabled={!canEditDetails}
                                          >
                                            {contract.logoUrl ? (
                                              <img
                                                src={contract.logoUrl}
                                                alt={`Logo de ${contract.name}`}
                                                className="w-full h-full object-contain"
                                                onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/32x32/cccccc/ffffff?text=Logo`; }}
                                              />
                                            ) : (
                                              <div className="w-full h-full flex items-center justify-center bg-gray-400 text-white text-xs font-bold">?</div>
                                            )}
                                          </button>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-gray-700">{involvedContracts.join(', ') || 'N/A'}</p>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                                    {canEditDetails ? (
                                      <input
                                        type="text"
                                        value={activity.frequency || ''}
                                        onChange={(e) => handleUpdateActivityDetail(activity.id, 'frequency', e.target.value)}
                                        placeholder="Ej: anual"
                                        className="w-full p-1 border rounded-md text-sm"
                                        disabled={!canEditDetails}
                                      />
                                    ) : (
                                      <span>{activity.frequency || 'N/A'}</span>
                                    )}
                                    {hasDependencies && (
                                      <div className="flex items-center text-xs text-gray-600 mt-1" title={dependencyTooltip}>
                                        🔗
                                        <span className="ml-1">Depende</span>
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-700 max-w-xs overflow-hidden text-ellipsis">
                                    {canEditDetails ? (
                                      <textarea
                                        value={activity.comment || ''}
                                        onChange={(e) => handleUpdateActivityDetail(activity.id, 'comment', e.target.value)}
                                        placeholder="Comentario (ej: revisar barrido)"
                                        rows="2"
                                        className="w-full p-1 border rounded-md text-sm"
                                        disabled={!canEditDetails}
                                      ></textarea>
                                    ) : (
                                      <p>{activity.comment || 'Sin comentario'}</p>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      };


      // --- Tab 5: Resumen por contrato y validación ---
      const SummaryTab = () => {
        const { db, userId, userRole, appId, showCustomModal, ROLES } = useAppContext();
        const [contracts, setContracts] = useState([]);
        const [sudsTypes, setSudsTypes] = useState([]);
        const [maintenanceActivities, setMaintenanceActivities] = useState([]);
        const [categories, setCategories] = useState([]);
        const [definedActivityNames, setDefinedActivityNames] = useState({});
        const [selectedContractId, setSelectedContractId] = useState('');
        const [loading, setLoading] = useState(true);
        const [contractAnalysis, setContractAnalysis] = useState('');
        const [generatingAnalysis, setGeneratingAnalysis] = useState(false);
        const [showAnalysisModal, setShowAnalysisModal] = useState(false);

        const [currentValidatorComment, setCurrentValidatorComment] = useState({});

        const canValidate = userRole === ROLES.MASTER || userRole === ROLES.CONTRACT_MANAGER;

        const locationTypeOptions = [
          { id: 'acera', name: 'SUDS en acera', icon: '🚶‍♀️' },
          { id: 'zona_verde', name: 'SUDS en zona verde', icon: '🌳' },
          { id: 'viario', name: 'SUDS en viario', icon: '🚗' },
          { id: 'infraestructura', name: 'Elementos Auxiliares', icon: 'https://img.freepik.com/vector-premium/icono-tuberia-fontanero-vector-simple-servicio-agua-tubo-aguas-residuales_98396-55465.jpg' },
        ];

        useEffect(() => {
          if (!db || !appId) return;

          const fetchInitialData = async () => {
            try {
              const contractsSnapshot = await getDocs(collection(db, `artifacts/${appId}/public/data/contracts`));
              const contractsData = contractsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

              setContracts(contractsData);

              if (contractsData.length > 0) {
                setSelectedContractId(contractsData[0].id);
              } else {
                setSelectedContractId('');
              }

              const sudsRef = collection(db, `artifacts/${appId}/public/data/sudsTypes`);
              const unsubscribeSuds = onSnapshot(sudsRef, (snapshot) => {
                const fetchedSudsTypes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const sudsTypesWithOrder = fetchedSudsTypes.map((suds, index) => {
                  if (suds.order === undefined) {
                    return { ...suds, order: index };
                  }
                  return suds;
                });
                setSudsTypes(sudsTypesWithOrder.sort((a, b) => (a.order || 0) - (b.order || 0)));
              }, (error) => {
                console.error("Error fetching SUDS types:", error);
                showCustomModal(`Error al cargar tipos de SUDS: ${error.message}`);
              });


              const activitiesRef = collection(db, `artifacts/${appId}/public/data/maintenanceActivities`);
              const unsubscribeActivities = onSnapshot(activitiesRef, (snapshot) => {
                const activitiesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setMaintenanceActivities(activitiesData);
                const initialComments = {};
                activitiesData.forEach(activity => {
                  initialComments[activity.id] = activity.validatorComment || '';
                });
                setCurrentValidatorComment(initialComments);
                setLoading(false);
              }, (error) => {
                console.error("Error fetching maintenance activities:", error);
                showCustomModal(`Error al cargar actividades de mantenimiento: ${error.message}`);
                setLoading(false);
              });

              const categoriesRef = doc(db, `artifacts/${appId}/public/data/appSettings`, 'maintenanceCategories');
              const unsubscribeCategories = onSnapshot(categoriesRef, (docSnap) => {
                if (docSnap.exists() && docSnap.data().categories) {
                  setCategories(docSnap.data().categories);
                }
              });

              const definedActivitiesRef = doc(db, `artifacts/${appId}/public/data/appSettings`, 'definedActivityNames');
              const unsubscribeDefinedActivities = onSnapshot(definedActivitiesRef, (docSnap) => {
                if (docSnap.exists() && docSnap.data()) {
                  setDefinedActivityNames(docSnap.data());
                } else {
                  setDefinedActivityNames({});
                }
              });


              return () => {
                unsubscribeSuds();
                unsubscribeActivities();
                unsubscribeCategories();
                unsubscribeDefinedActivities();
              };

            } catch (error) {
              console.error("Error fetching initial data for summary tab:", error);
              showCustomModal(`Error al cargar datos iniciales: ${error.message}`);
              setLoading(false);
            }
          };

          fetchInitialData();
        }, [db, appId, showCustomModal]);

        const handleValidation = async (activityId, status) => {
          if (!canValidate) return;
          const commentToSave = currentValidatorComment[activityId] || '';
          try {
            await updateDoc(doc(db, `artifacts/${appId}/public/data/maintenanceActivities`, activityId), {
              validationStatus: status,
              validatorComment: commentToSave,
              validatedBy: userId,
              validationTimestamp: new Date(),
            });
            showCustomModal(`Actividad ${status} con éxito.`);
          } catch (error) {
            console.error("Error updating validation status:", error);
            showCustomModal(`Error al actualizar estado de validación: ${error.message}`);
          }
        };

        const handleGenerateContractAnalysis = async () => {
          if (!canValidate) return;
          if (!selectedContract) {
            showCustomModal("Por favor, selecciona un contrato para generar el análisis.");
            return;
          }
          setGeneratingAnalysis(true);
          setContractAnalysis('');

          try {
            const contractDetails = `Contrato: ${selectedContract.name}, Responsable: ${selectedContract.responsible}, Resumen: ${selectedContract.summary}.`;
            const activitiesDetails = filteredActivities.map(act =>
              `Tipo SUDS: ${sudsTypes.find(s => s.id === act.sudsTypeId)?.name || 'Desconocido'}, Categoría: ${act.category}, Actividad: ${act.activityName}, Estado: ${act.status}, Comentario: ${act.comment || 'N/A'}, Validación: ${act.validationStatus || 'N/A'}.`
            ).join('\n');

            const prompt = `Realiza un análisis conciso del siguiente contrato de mantenimiento de SUDS y sus actividades asociadas. Identifica puntos fuertes, áreas de mejora, posibles riesgos o actividades que requieran atención. Ofrece recomendaciones.
            Detalles del contrato:
            ${contractDetails}
            Actividades de mantenimiento:
            ${activitiesDetails}
            El análisis debe ser profesional y de unas 5-7 frases.`;

            let chatHistory = [];
            chatHistory.push({ role: "user", parts: [{ text: prompt }] });
            const payload = { contents: chatHistory };
            const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });

            const result = await response.json();
            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
              const text = result.candidates[0].content.parts[0].text;
              setContractAnalysis(text);
              setShowAnalysisModal(true);
            } else {
              showCustomModal("No se pudo generar el análisis. Inténtalo de nuevo.");
            }
          } catch (error) {
            console.error("Error calling Gemini API for analysis:", error);
            showCustomModal(`Error al generar análisis: ${error.message}`);
          } finally {
            setGeneratingAnalysis(false);
          }
        };


        const selectedContract = contracts.find(c => c.id === selectedContractId);
        const filteredActivities = maintenanceActivities.filter(activity =>
          activity.applies && selectedContract && activity.involvedContracts && activity.involvedContracts.includes(selectedContract.name)
        );

        const activitiesBySudsType = sudsTypes.reduce((acc, suds) => {
          acc[suds.id] = filteredActivities.filter(act => act.sudsTypeId === suds.id);
          return acc;
        }, {});

        const allActivitiesFlat = generateAllActivitiesFlat(sudsTypes, categories, definedActivityNames);

        if (loading) {
          return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100 font-inter">
              <div className="text-xl text-gray-700">Cargando resumen...</div>
            </div>
          );
        }

        return (
          <div className="p-4 bg-white rounded-lg shadow-md">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-2">Resumen por contrato y validación</h2>

            <div className="mb-6">
              <label htmlFor="contractFilter" className="block text-sm font-medium text-gray-700 mb-1">Filtrar por Contrato:</label>
              <select
                id="contractFilter"
                value={selectedContractId}
                onChange={(e) => setSelectedContractId(e.target.value)}
                className="w-full md:w-1/2 lg:w-1/3 p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                {contracts.length === 0 ? (
                  <option value="">No hay contratos disponibles</option>
                ) : (
                  contracts.map(contract => (
                    <option key={contract.id} value={contract.id}>{contract.name}</option>
                  ))
                )}
              </select>
            </div>

            {selectedContract ? (
              <div>
                <h3 className="text-xl font-semibold text-gray-800 mb-4">Actividades para el contrato: <span className="text-blue-700">{selectedContract.name}</span></h3>
                <p className="text-gray-700 text-sm mb-4">Responsable del contrato: <span className="font-medium">{selectedContract.responsible}</span></p>

                <button
                  onClick={handleGenerateContractAnalysis}
                  disabled={generatingAnalysis || !canValidate}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors shadow-md text-sm mb-6 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generatingAnalysis ? 'Generando Análisis...' : '✨ Analizar Contrato'}
                </button>

                {sudsTypes.length === 0 || filteredActivities.length === 0 ? (
                  <p className="text-gray-600">No hay actividades propuestas para este contrato.</p>
                ) : (
                  <div className="space-y-6">
                    {sudsTypes.map(suds => {
                      const sudsActivities = activitiesBySudsType[suds.id];
                      if (!sudsActivities || sudsActivities.length === 0) return null;

                      const displayActivitiesForSuds = getDisplayActivities(suds.id, maintenanceActivities, categories, definedActivityNames)
                        .filter(act => act.involvedContracts && act.involvedContracts.includes(selectedContract.name));

                      if (displayActivitiesForSuds.length === 0) return null;

                      return (
                        <div key={suds.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm">
                          <h4 className="text-lg font-bold text-gray-900 mb-3 flex items-center">
                            {suds.name}
                            {suds.locationTypes && suds.locationTypes.length > 0 && (
                              <div className="ml-2 flex gap-1">
                                {locationTypeOptions.map(option =>
                                  suds.locationTypes.includes(option.id) && (
                                    <span key={option.id} className="text-base" title={option.name}>
                                      {option.icon.startsWith('http') ? (
                                        <img src={option.icon} alt={option.name} className="h-4 w-4 object-contain" onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/16x16/cccccc/ffffff?text=?`; }} />
                                      ) : (
                                        <span className="mr-1">{option.icon}</span>
                                      )}
                                    </span>
                                  )
                                )}
                              </div>
                            )}
                            {suds.imageUrls && suds.imageUrls.length > 0 && (
                              <img
                                src={suds.imageUrls[0]}
                                alt={`Imagen de ${suds.name}`}
                                className="w-10 h-10 object-cover rounded-md ml-2"
                                onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/40x40/cccccc/ffffff?text=SUDS`; }}
                              />
                            )}
                          </h4>
                          <p className="text-gray-700 text-sm mb-4 p-2 bg-gray-100 rounded-md">{suds.description}</p>
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-100">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoría</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[150px]">Actividad</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado Propuesto</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Comentario Propuesto</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Frecuencia</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado Validación</th>
                                  {canValidate && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones / Comentario Validador</th>}
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {displayActivitiesForSuds.map(activity => {
                                  const statusColorClass =
                                    activity.status === 'verde' ? 'bg-green-50' :
                                    activity.status === 'amarillo' ? 'bg-yellow-50' :
                                    activity.status === 'rojo' ? 'bg-red-50' : '';
                                  const validationStatusColor =
                                    activity.validationStatus === 'validado' ? 'text-green-600 font-semibold' :
                                    activity.validationStatus === 'rechazado' ? 'text-red-600 font-semibold' : 'text-gray-600';
                                  const hasDependencies = activity?.dependentActivities && activity.dependentActivities.length > 0;
                                  const dependencyTooltip = hasDependencies
                                    ? `Depende de: ${activity.dependentActivities.map(depId => {
                                        const depAct = allActivitiesFlat.find(a => a.id === depId);
                                        return depAct ? `${depAct.sudsName} - ${depAct.activityName}` : depId;
                                      }).join(', ')}`
                                    : 'No hay dependencias';

                                  return (
                                    <tr key={activity.id}>
                                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-800">{activity.category}</td>
                                      <td className="px-4 py-3 text-sm text-gray-800 whitespace-normal break-words">
                                        {activity.activityName}
                                      </td>
                                      <td className={`px-4 py-3 whitespace-nowrap text-sm ${statusColorClass}`}>
                                        {activity.status === 'verde' ? 'Incluido en contrato' : activity.status === 'amarillo' ? 'Fácilmente integrable' : activity.status === 'rojo' ? 'Actividad específica' : activity.status === 'no_aplica' ? 'No aplica' : 'N/A'}
                                      </td>
                                      <td className="px-4 py-3 text-sm text-gray-700 max-w-xs overflow-hidden text-ellipsis">
                                        <p>{activity.comment || 'Sin comentario'}</p>
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                                        {activity.frequency || 'N/A'}
                                        {hasDependencies && (
                                          <div className="flex items-center text-xs text-gray-600 mt-1" title={dependencyTooltip}>
                                            🔗
                                            <span className="ml-1">Depende</span>
                                          </div>
                                        )}
                                      </td>
                                      <td className={`px-4 py-3 whitespace-nowrap text-sm ${validationStatusColor}`}>
                                        {activity.validationStatus || 'N/A'}
                                        {activity.validatedBy && <span className="block text-xs text-gray-500">Por: {activity.validatedBy}</span>}
                                        {activity.validatorComment && <span className="block text-xs text-gray-600 italic">"{activity.validatorComment}"</span>}
                                      </td>
                                      {canValidate && (
                                        <td className="px-4 py-3 text-sm">
                                          <div className="flex flex-col space-y-2">
                                            <textarea
                                              placeholder="Comentario del validador"
                                              rows="2"
                                              className="w-full p-1 border rounded-md text-sm"
                                              value={currentValidatorComment[activity.id] || ''}
                                              onChange={(e) => {
                                                setCurrentValidatorComment(prev => ({
                                                  ...prev,
                                                  [activity.id]: e.target.value
                                                }));
                                              }}
                                              disabled={!canValidate}
                                            ></textarea>
                                            <div className="flex space-x-2">
                                              <button
                                                onClick={() => handleValidation(activity.id, 'validado')}
                                                className="flex-1 px-3 py-1 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                                disabled={!canValidate}
                                              >
                                                Aceptar
                                              </button>
                                              <button
                                                onClick={() => handleValidation(activity.id, 'rechazado')}
                                                className="flex-1 px-3 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                                disabled={!canValidate}
                                              >
                                                Rechazar
                                              </button>
                                              <button
                                                onClick={() => handleValidation(activity.id, 'pendiente')}
                                                className="flex-1 px-3 py-1 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                                disabled={!canValidate}
                                              >
                                                Reiniciar
                                              </button>
                                            </div>
                                          </div>
                                        </td>
                                      )}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-600">Por favor, selecciona un contrato para ver el resumen.</p>
            )}

            {showAnalysisModal && (
              <div className="fixed inset-0 bg-gray-600 bg-opacity50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full">
                  <h3 className="text-xl font-semibold mb-4">Análisis de Contrato: {selectedContract?.name}</h3>
                  <div className="prose max-w-none mb-4 max-h-96 overflow-y-auto">
                    <p>{contractAnalysis}</p>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => setShowAnalysisModal(false)}
                      className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      };


      // --- New Tab 6: Resumen Visual ---
      const VisualSummaryTab = () => {
        const { db, appId, showCustomModal } = useAppContext();
        const [sudsTypes, setSudsTypes] = useState([]);
        const [maintenanceActivities, setMaintenanceActivities] = useState([]);
        const [categories, setCategories] = useState([]);
        const [definedActivityNames, setDefinedActivityNames] = useState({});
        const [contracts, setContracts] = useState([]);
        const [loading, setLoading] = useState(true);
        const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
        const [selectedVisualLocationFilters, setSelectedVisualLocationFilters] = useState([]);


        const locationTypeOptions = [
          { id: 'acera', name: 'SUDS en acera', icon: '🚶‍♀️' },
          { id: 'zona_verde', name: 'SUDS en zona verde', icon: '🌳' },
          { id: 'viario', name: 'SUDS en viario', icon: '🚗' },
          { id: 'infraestructura', name: 'Elementos Auxiliares', icon: 'https://img.freepik.com/vector-premium/icono-tuberia-fontanero-vector-simple-servicio-agua-tubo-aguas-residuales_98396-55465.jpg' },
        ];

        useEffect(() => {
          if (!db || !appId) return;

          const fetchAllData = async () => {
            try {
              const sudsSnapshot = await getDocs(collection(db, `artifacts/${appId}/public/data/sudsTypes`));
              setSudsTypes(sudsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

              const activitiesRef = collection(db, `artifacts/${appId}/public/data/maintenanceActivities`);
              const unsubscribeActivities = onSnapshot(activitiesRef, (snapshot) => {
                const activitiesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setMaintenanceActivities(activitiesData);
                setLoading(false);
              }, (error) => {
                console.error("Error fetching maintenance activities:", error);
                showCustomModal(`Error al cargar actividades de mantenimiento: ${error.message}`);
                setLoading(false);
              });

              const categoriesRef = doc(db, `artifacts/${appId}/public/data/appSettings`, 'maintenanceCategories');
              const unsubscribeCategories = onSnapshot(categoriesRef, (docSnap) => {
                if (docSnap.exists() && docSnap.data().categories) {
                  setCategories(docSnap.data().categories);
                }
              });

              const definedActivitiesRef = doc(db, `artifacts/${appId}/public/data/appSettings`, 'definedActivityNames');
              const unsubscribeDefinedActivities = onSnapshot(definedActivitiesRef, (docSnap) => {
                if (docSnap.exists() && docSnap.data()) {
                  setDefinedActivityNames(docSnap.data());
                } else {
                  setDefinedActivityNames({});
                }
              });

              const contractsSnapshot = await getDocs(collection(db, `artifacts/${appId}/public/data/contracts`));
              setContracts(contractsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));


              return () => {
                unsubscribeActivities();
                unsubscribeCategories();
                unsubscribeDefinedActivities();
              };

            } catch (error) {
              console.error("Error fetching all data for visual summary:", error);
              showCustomModal(`Error al cargar datos para el resumen visual: ${error.message}`);
              setLoading(false);
            }
          };

          fetchAllData();
        }, [db, appId, showCustomModal]);

        const handleToggleVisualLocationFilter = (typeId) => {
          setSelectedVisualLocationFilters(prev =>
            prev.includes(typeId) ? prev.filter(id => id !== typeId) : [...prev, typeId]
          );
        };


        // Data processing for charts (adapted for 4 new charts)
        const processChartData = () => {
          const proposedStatusCounts = {
            'Incluido en contrato': 0,
            'Fácilmente integrable': 0,
            'Actividad específica': 0,
            'No aplica': 0,
            'N/A': 0,
          };

          const validationStatusCounts = {
            'pendiente': 0,
            'validado': 0,
            'rechazado': 0,
            'N/A': 0,
          };

          const locationTypeSpecificChartsData = {};
          locationTypeOptions.forEach(option => {
              locationTypeSpecificChartsData[option.id] = [];
          });


          maintenanceActivities.forEach(activity => {
            if (!activity.applies) return;

            const sudsType = sudsTypes.find(s => s.id === activity.sudsTypeId);
            if (!sudsType) return;

            if (activity.status === 'verde') proposedStatusCounts['Incluido en contrato']++;
            else if (activity.status === 'amarillo') proposedStatusCounts['Fácilmente integrable']++;
            else if (activity.status === 'rojo') proposedStatusCounts['Actividad específica']++;
            else if (activity.status === 'no_aplica') proposedStatusCounts['No aplica']++;
            else proposedStatusCounts['N/A']++;

            if (activity.validationStatus === 'validado') validationStatusCounts['validado']++;
            else if (activity.validationStatus === 'rechazado') validationStatusCounts['rechazado']++;
            else if (activity.validationStatus === 'pendiente') validationStatusCounts['pendiente']++;
            else validationStatusCounts['N/A']++;

            if (sudsType.locationTypes && sudsType.locationTypes.length > 0) {
              sudsType.locationTypes.forEach(locTypeId => {
                if (locationTypeSpecificChartsData[locTypeId]) {
                  let sudsEntry = locationTypeSpecificChartsData[locTypeId].find(entry => entry.name === sudsType.name);
                  if (!sudsEntry) {
                    sudsEntry = {
                      name: sudsType.name,
                      proposed_verde: 0,
                      proposed_amarillo: 0,
                      proposed_rojo: 0,
                      proposed_no_aplica: 0,
                      validated: 0,
                      rejected: 0,
                      pending: 0,
                    };
                    locationTypeSpecificChartsData[locTypeId].push(sudsEntry);
                  }

                  if (activity.status === 'verde') sudsEntry.proposed_verde++;
                  else if (activity.status === 'amarillo') sudsEntry.proposed_amarillo++;
                  else if (activity.status === 'rojo') sudsEntry.proposed_rojo++;
                  else if (activity.status === 'no_aplica') sudsEntry.proposed_no_aplica++;

                  if (activity.validationStatus === 'validado') sudsEntry.validated++;
                  else if (activity.validationStatus === 'rechazado') sudsEntry.rejected++;
                  else if (activity.validationStatus === 'pendiente') sudsEntry.pending++;
                }
              });
            }
          });

          const proposedPieData = Object.keys(proposedStatusCounts).map(key => ({
            name: key,
            value: proposedStatusCounts[key],
          })).filter(item => item.value > 0);

          const validationPieData = Object.keys(validationStatusCounts).map(key => ({
            name: key,
            value: validationStatusCounts[key],
          })).filter(item => item.value > 0);


          return { proposedPieData, validationPieData, locationTypeSpecificChartsData };
        };

        const { proposedPieData, validationPieData, locationTypeSpecificChartsData } = processChartData();

        const COLORS_PROPOSED = ['#4CAF50', '#FFC107', '#F44336', '#9E9E9E', '#BDBDBD'];
        const COLORS_VALIDATION = ['#FFC107', '#4CAF50', '#F44336', '#BDBDBD'];

        const allUniqueActivityNames = Array.from(new Set(
          Object.values(definedActivityNames).flat()
        )).sort();

        const filteredActivityNames = allUniqueActivityNames.filter(activityName => {
          if (selectedCategoryFilter === 'all') return true;
          return (definedActivityNames[selectedCategoryFilter] || []).includes(activityName);
        });

        const getContractLogo = (contractName) => {
          const contract = contracts.find(c => c.name === contractName);
          return contract?.logoUrl || `https://placehold.co/32x32/cccccc/ffffff?text=Logo`;
        };

        if (loading) {
          return <div className="text-center text-gray-600">Cargando resumen visual...</div>;
        }

        const filteredSudsTypesForTable = sudsTypes.filter(suds => {
          if (selectedVisualLocationFilters.length === 0) return true;
          return selectedVisualLocationFilters.some(filterType => suds.locationTypes?.includes(filterType));
        });


        return (
          <div className="p-4 bg-white rounded-lg shadow-md">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-2">Resumen Visual de Actividades</h2>

            {maintenanceActivities.filter(act => act.applies).length === 0 ? (
              <p className="text-gray-600">No hay datos de actividades de mantenimiento marcadas como necesarias para generar el resumen visual.</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Proposed Status Pie Chart */}
                <div className="bg-gray-50 p-4 rounded-lg shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 text-center">Estado Propuesto de Actividades</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={proposedPieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {proposedPieData.map((entry, index) => (
                          <Cell key={`cell-proposed-${index}`} fill={COLORS_PROPOSED[index % COLORS_PROPOSED.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Validation Status Pie Chart */}
                <div className="bg-gray-50 p-4 rounded-lg shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 text-center">Estado de Validación de Actividades</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={validationPieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={100}
                        fill="#82ca9d"
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {validationPieData.map((entry, index) => (
                          <Cell key={`cell-validation-${index}`} fill={COLORS_VALIDATION[index % COLORS_VALIDATION.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Individual Location Type Bar Charts */}
                {locationTypeOptions.map((locationType) => {
                    const chartData = locationTypeSpecificChartsData[locationType.id];
                    if (!chartData || chartData.length === 0) return null;

                    return (
                      <div key={locationType.id} className="lg:col-span-1 bg-gray-50 p-4 rounded-lg shadow-sm">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4 text-center">
                          Estado de validación de los {locationType.name}
                        </h3>
                        <ResponsiveContainer width="100%" height={400}>
                          <BarChart
                            data={chartData}
                            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="proposed_verde" stackId="proposed" fill="#4CAF50" name="Propuesto: Incluido" />
                            <Bar dataKey="proposed_amarillo" stackId="proposed" fill="#FFC107" name="Propuesto: Fácilmente integrable" />
                            <Bar dataKey="proposed_rojo" stackId="proposed" fill="#F44336" name="Propuesto: Actividad específica" />
                            <Bar dataKey="proposed_no_aplica" stackId="proposed" fill="#9E9E9E" name="Propuesto: No aplica" />
                            <Bar dataKey="validated" stackId="validation" fill="#2196F3" name="Validado" />
                            <Bar dataKey="rejected" stackId="validation" fill="#FF5722" name="Rechazado" />
                            <Bar dataKey="pending" stackId="validation" fill="#FFEB3B" name="Pendiente" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  })}


                {/* New Table: SUDS vs. Activities with Contract Status and Logo */}
                <div className="lg:col-span-2 bg-gray-50 p-4 rounded-lg shadow-sm overflow-x-auto">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 text-center">Estado de contrato por tipo de SUDS o elemento auxiliar y actividad</h3>

                  {/* Category Filter for the table */}
                  <div className="mb-4 flex items-center justify-center">
                    <label htmlFor="categoryFilter" className="block text-sm font-medium text-gray-700 mr-2">Filtrar por Categoría:</label>
                    <select
                      id="categoryFilter"
                      value={selectedCategoryFilter}
                      onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                      className="p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="all">Todas las categorías</option>
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  {/* Location Type Filter for the table */}
                  <div className="mb-8 p-4 bg-gray-100 rounded-lg border border-gray-200">
                    <h3 className="text-xl font-semibold text-gray-800 mb-3">Filtrar Tipos de SUDS y elementos auxiliares (Tabla):</h3>
                    <div className="flex flex-wrap gap-2">
                      {locationTypeOptions.map(option => (
                        <button
                          key={`filter-table-${option.id}`}
                          onClick={() => handleToggleVisualLocationFilter(option.id)}
                          className={`flex items-center justify-center p-2 rounded-md border transition-all duration-200
                            ${selectedVisualLocationFilters.includes(option.id)
                              ? 'bg-green-500 text-white border-green-600 shadow-md'
                              : 'bg-gray-200 text-gray-700 border-gray-300 hover:bg-green-100'
                            }`}
                          title={`Filtrar por: ${option.name}`}
                        >
                          {option.icon.startsWith('http') ? (
                            <img src={option.icon} alt={option.name} className="h-6 w-6 object-contain" onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/24x24/cccccc/ffffff?text=?`; }} />
                          ) : (
                            <span className="text-xl">{option.icon}</span>
                          )}
                          <span className="ml-2 text-sm">{option.name}</span>
                        </button>
                      ))}
                      {selectedVisualLocationFilters.length > 0 && (
                        <button
                          onClick={() => setSelectedVisualLocationFilters([])}
                          className="p-2 rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors text-sm shadow-md"
                        >
                          Limpiar Filtros
                        </button>
                      )}
                    </div>
                  </div>


                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-100 z-10">Tipo de SUDS</th>
                        {filteredActivityNames.map(activityName => (
                          <th key={activityName} className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {activityName}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredSudsTypesForTable.map(suds => (
                        <tr key={suds.id}>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white z-10">
                            {suds.name}
                            {suds.locationTypes && suds.locationTypes.length > 0 && (
                              <div className="ml-2 flex gap-1">
                                {locationTypeOptions.map(option =>
                                  suds.locationTypes.includes(option.id) && (
                                    <span key={option.id} className="text-base" title={option.name}>
                                      {option.icon.startsWith('http') ? (
                                        <img src={option.icon} alt={option.name} className="h-4 w-4 object-contain" onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/16x16/cccccc/ffffff?text=?`; }} />
                                      ) : (
                                        <span className="mr-1">{option.icon}</span>
                                      )}
                                    </span>
                                  )
                                )}
                              </div>
                            )}
                          </td>
                          {filteredActivityNames.map(activityName => {
                            const activity = maintenanceActivities.find(
                              act => act.sudsTypeId === suds.id && act.activityName === activityName && act.applies
                            );

                            let cellBgClass = 'bg-gray-50';
                            let contractLogos = [];

                            if (activity) {
                              if (activity.status === 'verde') {
                                cellBgClass = 'bg-green-100';
                              } else if (activity.status === 'amarillo') {
                                cellBgClass = 'bg-yellow-100';
                              } else if (activity.status === 'rojo') {
                                cellBgClass = 'bg-red-100';
                              } else if (activity.status === 'no_aplica') {
                                cellBgClass = 'bg-gray-200';
                              }

                              if (activity.involvedContracts && activity.involvedContracts.length > 0) {
                                contractLogos = activity.involvedContracts
                                  .map(contractName => ({
                                    name: contractName,
                                    url: getContractLogo(contractName)
                                  }))
                                  .sort((a, b) => a.name.localeCompare(b.name));
                              }
                            }

                            return (
                              <td key={`${suds.id}-${activityName}`} className={`p-2 border border-gray-200 text-center ${cellBgClass}`}>
                                {activity && activity.status && activity.status !== 'no_aplica' && contractLogos.length > 0 ? (
                                  <div
                                    className="flex flex-wrap items-center justify-center gap-1"
                                    title={
                                      (activity.comment ? `Comentario: ${activity.comment}\n` : '') +
                                      `Contratos: ${contractLogos.map(logo => logo.name).join(', ')}`
                                    }
                                  >
                                    {contractLogos.map((logo, idx) => (
                                      <img
                                        key={idx}
                                        src={logo.url}
                                        alt={`Logo de ${logo.name}`}
                                        className="w-8 h-8 object-contain rounded-full"
                                        onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/32x32/cccccc/ffffff?text=Logo`; }}
                                      />
                                    ))}
                                  </div>
                                ) : activity && activity.status === 'no_aplica' ? (
                                  <span className="text-xs text-gray-500">N/A</span>
                                ) : (
                                  <span className="text-xs text-gray-400">-</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      };

      // --- New Tab for Master: Gestión de usuarios ---
      // Removed UserChangesModal component
      const UserManagementTab = () => {
        const { db, auth, appId, showCustomModal, ROLES } = useAppContext();
        const [users, setUsers] = useState([]);
        const [newName, setNewName] = useState('');
        const [newEmail, setNewEmail] = useState('');
        const [newPassword, setNewPassword] = useState('');
        const [newRole, setNewRole] = useState(ROLES.SUDS_SPECIALIST); // Default for new user
        const [creatingUser, setCreatingUser] = useState(false);
        // Removed showChangesModal and selectedUserChanges states

        const rolesForCreation = [ROLES.MASTER, ROLES.SUDS_SPECIALIST, ROLES.CONTRACT_MANAGER];

        useEffect(() => {
          if (!db || !appId) return;

          const q = collection(db, `artifacts/${appId}/public/data/userProfiles`);
          const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setUsers(fetchedUsers);
          }, (error) => {
            console.error("Error fetching user profiles:", error);
            showCustomModal(`Error al cargar perfiles de usuario: ${error.message}`);
          });

          return () => unsubscribe();
        }, [db, appId, showCustomModal]);

        const handleCreateUser = async (e) => {
          e.preventDefault();
          if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) {
            showCustomModal("Por favor, rellena todos los campos para crear el usuario.");
            return;
          }

          setCreatingUser(true);
          try {
            // 1. Create user in Firebase Authentication
            const userCredential = await createUserWithEmailAndPassword(auth, newEmail.trim(), newPassword.trim());
            const newUserUid = userCredential.user.uid;

            // 2. Save user profile in Firestore
            await setDoc(doc(db, `artifacts/${appId}/public/data/userProfiles`, newUserUid), {
              uid: newUserUid,
              name: newName.trim(),
              email: newEmail.trim(),
              role: newRole,
              createdAt: new Date(),
              lastSentTimestamp: null, // Initialize timestamp
            });

            showCustomModal(`Usuario "${newName.trim()}" (${newEmail.trim()}) con rol "${newRole}" creado con éxito.`, () => {
              setNewName('');
              setNewEmail('');
              setNewPassword('');
              setNewRole(ROLES.SUDS_SPECIALIST);
            });

          } catch (error) {
            console.error("Error creating user:", error);
            let errorMessage = `Error al crear usuario: ${error.message}`;
            if (error.code === 'auth/email-already-in-use') {
              errorMessage = 'El correo electrónico ya está en uso por otra cuenta.';
            } else if (error.code === 'auth/weak-password') {
              errorMessage = 'La contraseña debe tener al menos 6 caracteres.';
            }
            showCustomModal(errorMessage);
          } finally {
            setCreatingUser(false);
          }
        };

        const handleDeleteUser = async (uid, email) => {
          showCustomModal(
            `¿Estás seguro de que quieres eliminar al usuario "${email}"? Esta acción es irreversible.`,
            async () => {
              try {
                // Note: Firebase Auth doesn't allow direct deletion of other users from client-side.
                // This would typically require a Firebase Cloud Function or Admin SDK from a trusted server.
                // For this exercise, we will only delete their profile document in Firestore.
                // The actual Firebase Auth user account will remain.
                await deleteDoc(doc(db, `artifacts/${appId}/public/data/userProfiles`, uid));
                showCustomModal(`Perfil de usuario "${email}" eliminado con éxito. (La cuenta de autenticación de Firebase no se elimina desde aquí).`);
              } catch (error) {
                console.error("Error deleting user profile:", error);
                showCustomModal(`Error al eliminar perfil de usuario: ${error.message}`);
              }
            },
            true
          );
        };

        // Removed handleViewUserChanges function

        return (
          <div className="p-4 bg-white rounded-lg shadow-md">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-2">Gestión de Usuarios</h2>

            <div className="mb-8 p-6 bg-blue-50 rounded-lg border border-blue-200">
              <h3 className="text-xl font-semibold text-blue-800 mb-4">Crear Nuevo Usuario</h3>
              <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="userName" className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                  <input
                    type="text"
                    id="userName"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nombre del usuario"
                    className="w-full p-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="userEmail" className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico</label>
                  <input
                    type="email"
                    id="userEmail"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    className="w-full p-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="userPassword" className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                  <input
                    type="password"
                    id="userPassword"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="********"
                    className="w-full p-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="userRoleSelect" className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                  <select
                    id="userRoleSelect"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md"
                  >
                    {rolesForCreation.map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2 flex justify-end mt-4">
                  <button
                    type="submit"
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={creatingUser}
                  >
                    {creatingUser ? 'Creando...' : 'Crear Usuario'}
                  </button>
                </div>
              </form>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Usuarios Existentes</h3>
              {users.length === 0 ? (
                <p className="text-gray-600">No hay usuarios registrados.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Correo Electrónico</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rol</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Último Envío</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {users.map(user => (
                        <tr key={user.id}>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.name}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">{user.email}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">{user.role}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">
                            {user.lastSentTimestamp ? new Date(user.lastSentTimestamp.seconds * 1000).toLocaleString() : 'Nunca'}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex space-x-2">
                              {/* Removed "Ver modificaciones" button */}
                              <button
                                onClick={() => handleDeleteUser(user.id, user.email)}
                                className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors text-xs"
                              >
                                Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Removed UserChangesModal render */}
          </div>
        );
      };

      // Removed UserChangesModal component definition

      export default App;

