import React, { useState, useEffect } from 'react';
import { Camera, Settings, Key, Wand2, ArrowRight, Video, Sparkles, AlertCircle, Save, RefreshCw, Clock, ChevronRight, Trash2, Menu } from 'lucide-react';
import { generateDescription } from './lib/gemini';
import { db } from './lib/firebase';
import { collection, doc, setDoc, getDocs, deleteDoc, query, orderBy } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import './index.css';

const ResizeHandle = () => (
  <PanelResizeHandle className="resize-handle desktop-only">
    <div className="resize-handle-bar" />
  </PanelResizeHandle>
);

function App() {
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // Input States
  const [productName, setProductName] = useState('');
  const [materials, setMaterials] = useState('');
  const [references, setReferences] = useState('');
  const [files, setFiles] = useState([]);

  // Execution States
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState(null); // Now an object: {title, overview, features}
  const [error, setError] = useState('');

  // History States
  // history structure: [{ id, productName, versions: [ { id, result, timestamp } ], lastUpdated }]
  const [history, setHistory] = useState([]);
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
  const [activeHistoryId, setActiveHistoryId] = useState(null);
  const [activeVersionId, setActiveVersionId] = useState(null);

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 900);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Load API key from local storage
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
      setApiKey(savedKey);
    } else {
      setShowSettings(true);
    }

    // Load History from Firestore
    const fetchHistory = async () => {
      try {
        const historyRef = collection(db, "history");
        const q = query(historyRef, orderBy("lastUpdated", "desc"));
        const snapshot = await getDocs(q);
        const historyData = snapshot.docs.map(doc => doc.data());
        setHistory(historyData);
      } catch (err) {
        console.error("Failed to fetch history from Firebase:", err);
      } finally {
        setIsHistoryLoaded(true);
      }
    };

    fetchHistory();
  }, []);

  const saveApiKey = (key) => {
    setApiKey(key);
    localStorage.setItem('gemini_api_key', key);
    setShowSettings(false);
  };

  const handleFileUpload = (e) => {
    const selectedFiles = Array.from(e.target.files);

    // Check total size limit (20MB)
    const totalSize = selectedFiles.reduce((acc, file) => acc + file.size, 0);
    if (totalSize > 20 * 1024 * 1024) {
      setError("Total file size exceeds 20MB limit.");
      return;
    }

    setFiles(prev => [...prev, ...selectedFiles].slice(0, 5));
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    if (!apiKey) {
      setError('Please configure your Gemini API Key first.');
      setShowSettings(true);
      return;
    }
    if (!productName.trim()) {
      setError('Product Name is required to save the history.');
      return;
    }
    if (!materials.trim() && files.length === 0) {
      setError('Product materials or files are required.');
      return;
    }

    setError('');
    setIsGenerating(true);

    try {
      // Process files to base64
      const processedFiles = [];
      for (const file of files) {
        const reader = new FileReader();
        const base64Promise = new Promise((resolve, reject) => {
          reader.readAsDataURL(file);
          reader.onload = () => resolve({
            base64: reader.result.split(',')[1],
            mimeType: file.type
          });
          reader.onerror = reject;
        });
        processedFiles.push(await base64Promise);
      }

      // We pass productName into materials to give Gemini context if they didn't explicitly write it
      const combinedMaterials = `Product Name Concept: ${productName}\n---\n${materials}`;
      const outputJson = await generateDescription(apiKey, combinedMaterials, references, processedFiles);

      setResult(outputJson);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const saveToHistory = async () => {
    if (!result || !productName) return;

    const newVersion = {
      id: Date.now().toString(),
      result: result,
      timestamp: new Date().toISOString()
    };

    let updatedHistoryList = [...history];
    const existingIdx = updatedHistoryList.findIndex(h => h.productName.toLowerCase() === productName.trim().toLowerCase());

    let productToSave = null;

    if (existingIdx >= 0) {
      productToSave = {
        ...updatedHistoryList[existingIdx],
        versions: [newVersion, ...updatedHistoryList[existingIdx].versions],
        lastUpdated: newVersion.timestamp
      };
      updatedHistoryList[existingIdx] = productToSave;
      updatedHistoryList.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
    } else {
      productToSave = {
        id: Date.now().toString() + "-prod",
        productName: productName.trim(),
        versions: [newVersion],
        lastUpdated: newVersion.timestamp
      };
      updatedHistoryList = [productToSave, ...updatedHistoryList];
    }

    try {
      if (!isHistoryLoaded) return; // safeguard

      // Save directly to Firestore using the product ID as the document ID
      await setDoc(doc(db, "history", productToSave.id), productToSave);

      // Update local state after successful cloud save
      setHistory(updatedHistoryList);
      setActiveHistoryId(productToSave.id);
      setActiveVersionId(newVersion.id);

      // Provide visual feedback (clearing result implies moving to history/ready to generate again)
      setResult(null);
    } catch (err) {
      console.error("Failed to save to Firebase:", err);
      alert("Failed to save to cloud database. Please check your network context.");
    }
  };

  const loadHistoryItem = (historyId, versionId) => {
    const prod = history.find(h => h.id === historyId);
    if (!prod) return;

    if (activeHistoryId !== historyId) {
      setMaterials('');
      setReferences('');
      setFiles([]);
    }

    const ver = prod.versions.find(v => v.id === versionId) || prod.versions[0];

    setActiveHistoryId(historyId);
    setActiveVersionId(ver.id);
    setProductName(prod.productName);
    setResult(ver.result);
    // Close mobile sidebar on select
    if (window.innerWidth <= 900) {
      setShowMobileSidebar(false);
    }
  };

  const deleteHistoryProduct = async (e, productId) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, "history", productId));
      setHistory(prev => prev.filter(h => h.id !== productId));
      if (activeHistoryId === productId) {
        startNew();
      }
    } catch (err) {
      console.error("Failed to delete product from Firebase:", err);
    }
  };

  const deleteHistoryVersion = async (e, productId, versionId) => {
    e.stopPropagation();

    // Find the product to edit
    const prodIdx = history.findIndex(h => h.id === productId);
    if (prodIdx < 0) return;

    let productToUpdate = { ...history[prodIdx] };
    productToUpdate.versions = productToUpdate.versions.filter(v => v.id !== versionId);

    try {
      if (productToUpdate.versions.length === 0) {
        // If no versions left, delete the entire product
        await deleteDoc(doc(db, "history", productId));
        setHistory(prev => prev.filter(h => h.id !== productId));
        if (activeHistoryId === productId) startNew();
      } else {
        // Otherwise update the document and lastUpdated timestamp
        productToUpdate.lastUpdated = productToUpdate.versions[0].timestamp;
        await setDoc(doc(db, "history", productId), productToUpdate);

        let newHistory = [...history];
        newHistory[prodIdx] = productToUpdate;
        setHistory(newHistory);

        if (activeHistoryId === productId && activeVersionId === versionId) {
          loadHistoryItem(productId, productToUpdate.versions[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to delete version from Firebase:", err);
    }
  };

  const startNew = () => {
    setActiveHistoryId(null);
    setActiveVersionId(null);
    setResult(null);
    setProductName('');
    setMaterials('');
    setReferences('');
    setFiles([]);
  };

  return (
    <div className="app-layout">
      {isMobile && (
        <div className="mobile-header mobile-only">
          <button onClick={() => setShowMobileSidebar(true)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}><Menu size={24} /></button>
          <h1 style={{ fontSize: '1.1rem', margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            Product Content <span className="text-gradient">Generator</span>
          </h1>
          <button onClick={() => setShowSettings(true)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><Settings size={20} /></button>
        </div>
      )}

      {isMobile && showMobileSidebar && <div className="mobile-overlay" onClick={() => setShowMobileSidebar(false)} />}

      <PanelGroup direction="horizontal" autoSaveId="cinecraft-layout-v2" className="main-panel-group">
        <Panel defaultSize={30} minSize={15} maxSize={50} className={`sidebar-panel ${showMobileSidebar ? 'mobile-open' : ''}`}>
          <aside className="sidebar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
              <div style={{
                background: 'var(--accent-gradient)',
                padding: '8px',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-glow)'
              }}>
                <Camera color="white" size={20} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <h1 style={{ fontSize: '1.1rem', margin: 0, lineHeight: 1.2 }}>
                  Product Content
                  <div className="text-gradient">Generator</div>
                </h1>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>By CineGearPro</span>
              </div>
            </div>

            <button
              onClick={startNew}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-color)',
                color: 'white',
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginBottom: '24px',
                fontWeight: 500,
                transition: 'all 0.2s'
              }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            >
              <Sparkles size={16} /> New Description
            </button>

            <div style={{
              fontSize: '0.8rem',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              fontWeight: 700,
              letterSpacing: '1px',
              marginBottom: '12px'
            }}>
              History Vault
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' }}>
              {history.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', marginTop: '24px' }}>
                  No history yet. Start generating!
                </p>
              ) : (
                history.map(prod => (
                  <div key={prod.id} style={{ display: 'flex', flexDirection: 'column' }}>
                    <div
                      className={`history-item ${activeHistoryId === prod.id ? 'active' : ''}`}
                      onClick={() => loadHistoryItem(prod.id, prod.versions[0].id)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <div className="history-title" style={{ margin: 0 }}>{prod.productName}</div>
                        <button
                          onClick={(e) => deleteHistoryProduct(e, prod.id)}
                          style={{
                            background: 'transparent', border: 'none', color: 'var(--text-muted)',
                            cursor: 'pointer', padding: '2px'
                          }}
                          onMouseOver={e => e.currentTarget.style.color = 'var(--error-color)'}
                          onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="history-meta">
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={12} />
                          {new Date(prod.lastUpdated).toLocaleDateString()}
                        </span>
                        <span>{prod.versions.length} ver(s)</span>
                      </div>
                    </div>

                    {/* Visual sub-list if active and has multiple versions */}
                    {activeHistoryId === prod.id && prod.versions.length > 1 && (
                      <div style={{ paddingLeft: '16px', borderLeft: '2px solid var(--border-color)', marginLeft: '12px', marginBottom: '8px' }}>
                        {prod.versions.map((ver, idx) => (
                          <div
                            key={ver.id}
                            onClick={() => loadHistoryItem(prod.id, ver.id)}
                            style={{
                              padding: '6px 8px',
                              fontSize: '0.8rem',
                              color: activeVersionId === ver.id ? 'var(--accent-color)' : 'var(--text-secondary)',
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <ChevronRight size={12} />
                              Version {prod.versions.length - idx}
                            </div>
                            <button
                              onClick={(e) => deleteHistoryVersion(e, prod.id, ver.id)}
                              style={{
                                background: 'transparent', border: 'none', color: 'var(--text-muted)',
                                cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center'
                              }}
                              onMouseOver={e => e.currentTarget.style.color = 'var(--error-color)'}
                              onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </aside>
        </Panel>
        <ResizeHandle />
        <Panel defaultSize={70} minSize={50} className="content-panel">
          <main className="main-content">
            <header className="desktop-only" style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              padding: '24px 0',
              marginBottom: '12px'
            }}>
              <button
                onClick={() => setShowSettings(true)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  fontFamily: 'inherit',
                  fontWeight: 500
                }}
                onMouseOver={(e) => e.currentTarget.style.color = 'white'}
                onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
              >
                <Settings size={18} /> API Configuration
              </button>
            </header>

            <PanelGroup direction="horizontal" className="nested-panel-group">
              <Panel defaultSize={45} minSize={25} className="input-panel-wrapper">
                {/* Left Column - Input */}
                <div className="inner-scroll-col" style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingRight: '16px' }}>
                  <div>
                    <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Draft Workspace</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                      Fill in the details. Gemini will synthesize and format everything into perfect British English.
                    </p>
                  </div>

                  <div className="glass-panel" style={{ padding: '24px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, marginBottom: '8px' }}>
                      <Camera size={18} color="var(--accent-color)" /> Product Name *
                    </label>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '12px' }}>
                      A short identifier for your history list.
                    </p>
                    <input
                      type="text"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder="e.g. Arri Alexa 35, DZOFILM Catta Zoom..."
                    />
                  </div>

                  <div className="glass-panel" style={{ padding: '24px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, marginBottom: '8px' }}>
                      <Video size={18} color="var(--accent-color)" /> Product Materials *
                    </label>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '12px' }}>
                      Paste your raw specs, Chinese drafts, or feature lists here.
                    </p>
                    <textarea
                      value={materials}
                      onChange={(e) => setMaterials(e.target.value)}
                      placeholder="e.g. Full-frame cinema camera, 8K 60fps RAW internal recording, 17 stops dynamic range, dual native ISO..."
                      style={{ minHeight: '120px', resize: 'vertical', marginBottom: '16px' }}
                    />

                    {/* File Upload Section */}
                    <div style={{
                      border: '2px dashed var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '16px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'all 0.2s',
                      background: 'rgba(0,0,0,0.2)'
                    }}
                      onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--text-secondary)'}
                      onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                    >
                      <input
                        type="file"
                        multiple
                        onChange={handleFileUpload}
                        accept="image/*,.pdf,.doc,.docx,.txt"
                        style={{
                          position: 'absolute',
                          top: 0, left: 0, right: 0, bottom: 0,
                          opacity: 0,
                          cursor: 'pointer'
                        }}
                      />
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
                        Drag & drop or tap to attach Files/Images (max 20MB)
                      </p>
                    </div>

                    {files.length > 0 && (
                      <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {files.map((file, index) => (
                          <div key={index} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            background: 'rgba(0,0,0,0.4)', padding: '8px 12px',
                            borderRadius: 'var(--radius-sm)', fontSize: '0.85rem'
                          }}>
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '85%' }}>
                              {file.name}
                            </span>
                            <button onClick={() => removeFile(index)} style={{ background: 'transparent', border: 'none', color: 'var(--error-color)', cursor: 'pointer' }}>×</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="glass-panel" style={{ padding: '24px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, marginBottom: '8px' }}>
                      <Sparkles size={18} color="var(--accent-color)" /> Reference Links
                    </label>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '12px' }}>
                      Paste URLs (competitors, official site).
                    </p>
                    <textarea
                      value={references}
                      onChange={(e) => setReferences(e.target.value)}
                      placeholder="Paste URLs (official site, news coverage, competitor products). e.g., https://..."
                      style={{ minHeight: '80px', resize: 'vertical' }}
                    />
                  </div>

                  {error && (
                    <div style={{
                      background: 'rgba(255, 51, 102, 0.1)',
                      border: '1px solid var(--error-color)',
                      color: 'var(--error-color)',
                      padding: '16px', borderRadius: 'var(--radius-sm)',
                      display: 'flex', alignItems: 'center', gap: '12px'
                    }}>
                      <AlertCircle size={20} />
                      <span style={{ fontSize: '0.9rem' }}>{error}</span>
                    </div>
                  )}

                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    style={{
                      background: isGenerating ? 'var(--bg-surface)' : 'var(--accent-gradient)',
                      border: isGenerating ? '1px solid var(--border-color)' : 'none',
                      color: isGenerating ? 'var(--text-secondary)' : 'white',
                      padding: '16px',
                      borderRadius: 'var(--radius-md)',
                      cursor: isGenerating ? 'not-allowed' : 'pointer',
                      fontWeight: 600, fontSize: '1rem',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
                      boxShadow: isGenerating ? 'none' : '0 8px 24px rgba(121, 40, 202, 0.4)',
                      transition: 'all 0.3s'
                    }}
                  >
                    {isGenerating ? (
                      <>
                        <div style={{
                          width: '20px', height: '20px',
                          border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent-color)',
                          borderRadius: '50%', animation: 'spin 1s linear infinite'
                        }} />
                        Synthesizing...
                      </>
                    ) : (
                      <>Generate Description <Wand2 size={20} /></>
                    )}
                    <style>{'@keyframes spin { 100% { transform: rotate(360deg); } }'}</style>
                  </button>
                </div>
              </Panel>
              <ResizeHandle />
              <Panel defaultSize={55} minSize={30} className="output-panel-wrapper">
                {/* Right Column - Output */}
                <div className="inner-scroll-col" style={{ display: 'flex', flexDirection: 'column', paddingLeft: '16px' }}>
                  <div className="glass-panel" style={{
                    flexGrow: 1,
                    padding: '32px',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative'
                  }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      paddingBottom: '16px', borderBottom: '1px solid var(--border-color)', marginBottom: '24px'
                    }}>
                      <h3 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                        <ArrowRight color="var(--accent-color)" /> Output Result
                      </h3>

                      {/* Save & Regenerate Actions appear when there is a result */}
                      {result && (
                        <div style={{ display: 'flex', gap: '12px' }}>
                          <button
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            style={{
                              background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)',
                              color: 'white', padding: '8px 16px', borderRadius: 'var(--radius-sm)',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem'
                            }}
                          >
                            <RefreshCw size={14} /> Regenerate
                          </button>
                          <button
                            onClick={saveToHistory}
                            style={{
                              background: 'var(--accent-color)', border: 'none',
                              color: 'white', padding: '8px 16px', borderRadius: 'var(--radius-sm)',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem',
                              fontWeight: 600
                            }}
                          >
                            <Save size={14} /> Save Version
                          </button>
                        </div>
                      )}
                    </div>

                    {result ? (
                      <div style={{ color: 'var(--text-primary)', overflowY: 'auto' }}>

                        {/* TITLE RENDER */}
                        <div style={{ marginBottom: '32px' }}>
                          <div style={{ fontSize: '0.8rem', color: 'var(--accent-color)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '1px', marginBottom: '8px' }}>Title</div>
                          <h2 style={{ fontSize: '1.4rem', lineHeight: '1.4', margin: 0 }}>{result.title}</h2>
                        </div>

                        {/* OVERVIEW RENDER */}
                        <div style={{ marginBottom: '32px' }}>
                          <div style={{ fontSize: '0.8rem', color: 'var(--accent-color)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '1px', marginBottom: '8px' }}>Overview</div>
                          <div className="markdown-body" style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                            <ReactMarkdown components={{
                              strong: ({ node, ...props }) => <strong style={{ color: 'white', fontWeight: 600 }} {...props} />
                            }}>{result.overview}</ReactMarkdown>
                          </div>
                        </div>

                        {/* FEATURES RENDER */}
                        <div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--accent-color)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '1px', marginBottom: '12px' }}>Features</div>
                          <ul style={{ paddingLeft: '20px', margin: 0, color: 'var(--text-secondary)' }}>
                            {result.features && result.features.map((feature, idx) => (
                              <li key={idx} style={{ marginBottom: '12px', lineHeight: 1.6 }}>
                                <ReactMarkdown components={{
                                  p: ({ node, ...props }) => <span {...props} />, // Prevent paragraphs inside list items
                                  strong: ({ node, ...props }) => <strong style={{ color: 'white', fontWeight: 600 }} {...props} />
                                }}>{feature}</ReactMarkdown>
                              </li>
                            ))}
                          </ul>
                        </div>

                      </div>
                    ) : (
                      <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', flexGrow: 1, opacity: 0.5, gap: '16px'
                      }}>
                        <Wand2 size={48} strokeWidth={1} />
                        <p>Your polished British English description will appear here.</p>
                      </div>
                    )}
                  </div>
                </div>
              </Panel>
            </PanelGroup>
          </main>
        </Panel>
      </PanelGroup>

      {/* Settings Modal */}
      {
        showSettings && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
          }}>
            <div className="glass-panel" style={{ padding: '32px', width: '100%', maxWidth: '400px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <Key color="var(--accent-color)" />
                <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Configuration</h2>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px' }}>
                Enter your Google Gemini API Key. It will be stored securely in your browser's local storage.
              </p>
              <input
                type="password"
                placeholder="AIzaSy..."
                defaultValue={apiKey}
                id="api-key-input"
                style={{ marginBottom: '24px' }}
              />
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                {apiKey && (
                  <button
                    onClick={() => setShowSettings(false)}
                    style={{
                      background: 'transparent', border: 'none', color: 'var(--text-secondary)',
                      padding: '10px 16px', borderRadius: 'var(--radius-sm)', cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={() => {
                    const val = document.getElementById('api-key-input').value;
                    if (val) saveApiKey(val);
                  }}
                  style={{
                    background: 'var(--accent-gradient)', border: 'none', color: 'white',
                    padding: '10px 24px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Save & Continue
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div>
  );
}

export default App;
