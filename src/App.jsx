import React, { useState, useEffect } from 'react';
import { Camera, Settings, Key, Wand2, ArrowRight, Video, Sparkles, AlertCircle, Save, RefreshCw, Clock, ChevronRight, Trash2, Menu, FileText, X, Image } from 'lucide-react';
import { generateDescription } from './lib/ai';
import { db } from './lib/firebase';
import { collection, doc, setDoc, getDocs, deleteDoc, query, orderBy, onSnapshot } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import './index.css';

function App() {
  const [engineStatus, setEngineStatus] = useState('Standby');
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [genMode, setGenMode] = useState('concise'); // 'concise' or 'detailed'

  // Detect if running in a Chrome Extension context (Side Panel / Popup)
  const isExtension = typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;

  // Input States
  const [productName, setProductName] = useState('');
  const [materials, setMaterials] = useState('');
  const [references, setReferences] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [files, setFiles] = useState([]);
  const fileInputRef = React.useRef(null);

  // Execution States
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // History States
  const [history, setHistory] = useState([]);
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
  const [activeHistoryId, setActiveHistoryId] = useState(null);
  const [activeVersionId, setActiveVersionId] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Extension Logic: Listen for scraped data from Shopify page (only in extension mode)
  useEffect(() => {
    if (isExtension && chrome.runtime && chrome.runtime.onMessage) {
      const messageListener = (request) => {
        if (request.action === "PRODUCT_DATA_SCRAPED") {
          setProductName(request.data.title);
        }
      };
      chrome.runtime.onMessage.addListener(messageListener);
      return () => chrome.runtime.onMessage.removeListener(messageListener);
    }
  }, []);

  const getShopifyHtml = () => {
    if (!result) return '';
    
    const sectionsHtml = result.sections && result.sections.length > 0 
      ? result.sections.map(s => `
          <p><strong>${s.heading}</strong></p>
          <p>${s.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</p>
          <p>&nbsp;</p>
        `).join('')
      : '';

    return `
      <div class="product-description-ai">
        ${result.overview.split('\n').filter(p => p.trim()).map(p => `
          <p>${p.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</p>
          <p>&nbsp;</p>
        `).join('')}
        
        ${sectionsHtml}
        
        <p>&nbsp;</p>
        <p><strong>Features:</strong></p>
        <ul>
          ${result.features.map(f => `
            <li style="margin-bottom: 8px;">
              ${f.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}
            </li>
          `).join('')}
        </ul>
        
        <p>&nbsp;</p>
        <p><span style="color: rgb(230, 230, 230);">*This text is summarised by AI</span></p>
      </div>
    `;
  };

  const applyToShopify = () => {
    const descriptionHtml = getShopifyHtml();
    if (!descriptionHtml) return;
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "APPLY_TO_SHOPIFY",
            data: {
              title: result.title,
              description: descriptionHtml
            }
          });
        }
      });
  };

  const copyToClipboard = async () => {
    const html = getShopifyHtml();
    try {
      await navigator.clipboard.writeText(html);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  useEffect(() => {
    const historyRef = collection(db, "history");
    const q = query(historyRef, orderBy("lastUpdated", "desc"));
    
    // Use onSnapshot for real-time collaboration across all team members
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const historyData = snapshot.docs.map(doc => doc.data());
      setHistory(historyData);
      setIsHistoryLoaded(true);
    }, (err) => {
      console.error("Firebase Real-time Sync Error:", err);
      setIsHistoryLoaded(true);
    });

    return () => unsubscribe();
  }, []);

  const handleFileUpload = (e) => {
    const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
    if (selectedFiles.length === 0) return;
    processFiles(selectedFiles);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    processFiles(droppedFiles);
  };

  const processFiles = (selectedFiles) => {
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
    if (!productName.trim()) {
      setError('Product Name is required.');
      return;
    }
    if (!materials.trim() && !references.trim() && files.length === 0) {
      setError('Please provide at least one source: Links, Materials, or Images.');
      return;
    }

    setError('');
    setIsGenerating(true);

    try {
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

      const combinedMaterials = `Product Name Concept: ${productName}\n---\n${materials}`;
      const outputJson = await generateDescription(combinedMaterials, references, processedFiles, setEngineStatus, genMode, customInstructions, history);
      setResult(outputJson);
      setEngineStatus('Success');
    } catch (err) {
      setError(err.message);
      setEngineStatus('Failed');
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
      await setDoc(doc(db, "history", productToSave.id), productToSave);
      // We rely on onSnapshot to update the history list
      setActiveHistoryId(productToSave.id);
      setActiveVersionId(newVersion.id);
      // Removed setResult(null) to allow user to see what they saved
    } catch (err) {
      console.error("Failed to save to Firebase:", err);
    }
  };

  const loadHistoryItem = (historyId, versionId) => {
    const prod = history.find(h => h.id === historyId);
    if (!prod) return;
    const ver = prod.versions.find(v => v.id === versionId) || prod.versions[0];
    setActiveHistoryId(historyId);
    setActiveVersionId(ver.id);
    setProductName(prod.productName);
    setResult(ver.result);
    setShowMobileSidebar(false);
  };

  const deleteHistoryProduct = async (e, productId) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, "history", productId));
      setHistory(prev => prev.filter(h => h.id !== productId));
      if (activeHistoryId === productId) startNew();
    } catch (err) {
      console.error("Failed to delete product:", err);
    }
  };

  const deleteHistoryVersion = async (e, productId, versionId) => {
    e.stopPropagation();
    const prodIdx = history.findIndex(h => h.id === productId);
    if (prodIdx < 0) return;

    let productToUpdate = { ...history[prodIdx] };
    productToUpdate.versions = productToUpdate.versions.filter(v => v.id !== versionId);

    try {
      if (productToUpdate.versions.length === 0) {
        await deleteDoc(doc(db, "history", productId));
        setHistory(prev => prev.filter(h => h.id !== productId));
        if (activeHistoryId === productId) startNew();
      } else {
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
      console.error("Failed to delete version:", err);
    }
  };

  const startNew = () => {
    setActiveHistoryId(null);
    setActiveVersionId(null);
    setResult(null);
    setProductName('');
    setMaterials('');
    setReferences('');
    setCustomInstructions('');
    setFiles([]);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-left">
          <div className="brand-section" style={{ marginBottom: 0 }}>
             <div className="brand-icon" style={{ width: '32px', height: '32px' }}>
                <Camera color="white" size={16} />
             </div>
             <h1 className="header-title">
               CineGear <span className="text-gradient">Description Generator</span>
             </h1>
          </div>
        </div>
        <div className="engine-status">
          <span className="status-dot" style={{ background: isGenerating ? 'var(--accent-primary)' : '#10b981', boxShadow: isGenerating ? '0 0 10px var(--accent-primary)' : 'none' }} />
          Engine: {engineStatus}
        </div>
      </header>

      <div className={`mobile-overlay ${showMobileSidebar ? 'visible' : ''}`} onClick={() => setShowMobileSidebar(false)} />

      <div className="main-layout">
        <div className={`sidebar-panel ${showMobileSidebar ? 'mobile-open' : ''}`}>
          <aside className="sidebar">
            <button onClick={startNew} className="new-btn">
              <Sparkles size={16} /> New Description
            </button>

            <div className="history-label">History Vault</div>
            <div className="history-list">
              {history.length === 0 ? (
                <p className="no-history" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '20px' }}>No history yet.</p>
              ) : (
                history.map(prod => (
                  <div key={prod.id} className="history-group">
                    <div className={`history-item ${activeHistoryId === prod.id ? 'active' : ''}`} onClick={() => loadHistoryItem(prod.id, prod.versions[0].id)}>
                      <div className="history-header">
                        <div className="history-title">{prod.productName}</div>
                        <button onClick={(e) => deleteHistoryProduct(e, prod.id)} className="delete-btn" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Trash2 size={12} /></button>
                      </div>
                      <div className="history-meta">
                        <Clock size={11} /> {new Date(prod.lastUpdated).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>

        <div className="pane-container">
          {/* Column 2: Draft Workspace */}
          <div className="pane workspace-pane">
            <div className="pane-header">
              <h2 className="pane-title">Draft Workspace</h2>
              <p className="pane-subtitle">Fill in the details. AI will synthesize and format everything into perfect British English.</p>
            </div>
            
            <div className="pane-content">
              <div className="workspace-stack">
                <div className="glass-panel input-card">
                  <label><Camera size={16} /> Product Name *</label>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px' }}>A short identifier for your history list.</p>
                  <input type="text" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="e.g. Arri Alexa 35, DZOFILM Catta Zoom..." />
                </div>

                <div className="glass-panel input-card">
                    <label><RefreshCw size={16} /> Links</label>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px' }}>Paste product links, news coverage, official URLs, or video links here.</p>
                    <textarea 
                        style={{ minHeight: '60px' }}
                        value={references} 
                        onChange={(e) => setReferences(e.target.value)} 
                        placeholder="e.g. https://www.arri.com/..." 
                    />
                </div>

                <div className="glass-panel input-card">
                  <label><Video size={16} /> Product Materials</label>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px' }}>Copy or enter raw product descriptions, technical specifications, key selling points, etc.</p>
                  <textarea value={materials} onChange={(e) => setMaterials(e.target.value)} placeholder="e.g. Full-frame cinema camera, 8K 60fps RAW internal recording, 17 stops dynamic range..." />
                  
                  <div 
                    className="file-upload-zone"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      multiple 
                      style={{ display: 'none' }}
                      onChange={handleFileUpload} 
                      accept="image/*,.pdf,.doc,.docx,.txt" 
                    />
                    <div className="upload-content" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Image size={20} style={{ opacity: 0.7 }} />
                      <p>Drag & drop or tap to attach Files/Images (max 20MB)</p>
                    </div>
                  </div>

                  {files.length > 0 && (
                    <div className="file-preview-list" style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {files.map((file, idx) => (
                        <div key={idx} className="file-chip" style={{ 
                          background: 'rgba(255,255,255,0.05)', 
                          padding: '6px 12px', 
                          borderRadius: '8px', 
                          fontSize: '0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          border: '1px solid var(--border-color)'
                        }}>
                          <FileText size={14} />
                          <span style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {file.name}
                          </span>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setFiles(prev => prev.filter((_, i) => i !== idx));
                            }}
                            style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', padding: '2px', display: 'flex' }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="glass-panel input-card">
                    <label><Wand2 size={16} /> Custom Prompt</label>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px' }}>Special requests? (e.g., "Exclude weight specs" or "Focus on low-light performance")</p>
                    <textarea 
                        style={{ minHeight: '60px' }}
                        value={customInstructions} 
                        onChange={(e) => setCustomInstructions(e.target.value)} 
                        placeholder="Type your extra requirements here..." 
                    />
                </div>

                {error && <div className="error-alert" style={{ color: 'var(--error)', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'center' }}><AlertCircle size={16} /> {error}</div>}

                <div className="master-actions">
                  <div className="mode-selector">
                    <button onClick={() => setGenMode('concise')} className={`mode-btn ${genMode === 'concise' ? 'active' : ''}`}>
                      Concise Summary
                    </button>
                    <button onClick={() => setGenMode('detailed')} className={`mode-btn ${genMode === 'detailed' ? 'active' : ''}`}>
                      Detailed Analysis
                    </button>
                  </div>

                  <button onClick={handleGenerate} disabled={isGenerating} className="generate-btn">
                    {isGenerating ? 'Synthesizing...' : 'Generate Description'}
                    {!isGenerating && <Sparkles size={18} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Column 3: Output Result */}
          <div className="pane result-pane">
            <div className="pane-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 className="pane-title"><ArrowRight size={20} color="var(--accent-primary)" /> Output Result</h2>
              </div>
              {result && (
                  <div className="result-actions" style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      onClick={copyToClipboard} 
                      className="result-btn" 
                      style={{ 
                        background: copyFeedback ? 'var(--success)' : 'rgba(255,179,0,0.1)', 
                        color: copyFeedback ? 'white' : 'var(--accent-primary)', 
                        border: '1px solid var(--accent-primary)',
                        transition: 'all 0.3s'
                      }}
                    >
                      {copyFeedback ? 'Copied!' : 'Copy HTML'}
                    </button>
                    {isExtension && <button onClick={applyToShopify} className="result-btn">Apply to Shopify</button>}
                    <button onClick={saveToHistory} className="result-btn save-vault-btn">Save to Vault</button>
                  </div>
              )}
            </div>

            <div className="pane-content">
              {result ? (
                <div className="result-viewer">
                  <div className="result-field">
                    <span className="field-label">Title</span>
                    <h2 className="field-value">{result.title}</h2>
                  </div>

                  <div className="result-field">
                    <span className="field-label">Overview</span>
                    <div className="markdown-body">
                      <ReactMarkdown>{result.overview}</ReactMarkdown>
                    </div>
                  </div>

                  {result.sections && result.sections.map((section, idx) => (
                    <div key={idx} className="result-field">
                      <span className="field-label">{section.heading}</span>
                      <div className="markdown-body">
                        <ReactMarkdown>{section.content}</ReactMarkdown>
                      </div>
                    </div>
                  ))}

                    <div className="result-field">
                      <span className="field-label">Features:</span>
                    <ul className="markdown-body">
                      {result.features?.map((f, i) => (
                        <li key={i}>
                          <ReactMarkdown>{f}</ReactMarkdown>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p style={{ marginTop: '24px', fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    *This text is summarised by AI
                  </p>
                </div>
              ) : (
                <div className="empty-state">
                  <Sparkles size={48} />
                  <p>Your polished British English description will appear here.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
