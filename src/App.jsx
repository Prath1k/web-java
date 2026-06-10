import { useState, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { java } from '@codemirror/lang-java';
import { Play, Terminal, Code2, Loader2, Code, Sparkles, Edit2, Check, X, Square } from 'lucide-react';
import { executeJavaCode } from './services/api';

const DEFAULT_CODE = `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, Web Java!");
    }
}`;

const beautifyJava = (code) => {
  const lines = code.split('\n');
  let indentLevel = 0;
  const indentString = '    ';
  let result = [];
  let inMultilineComment = false;

  for (let line of lines) {
    let trimmed = line.trim();
    
    if (trimmed.length === 0) {
      result.push('');
      continue;
    }

    if (trimmed.startsWith('/*')) {
      inMultilineComment = true;
    }
    
    if (inMultilineComment) {
      result.push(indentString.repeat(indentLevel) + trimmed);
      if (trimmed.endsWith('*/')) {
        inMultilineComment = false;
      }
      continue;
    }

    let openCount = 0;
    let closeCount = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < trimmed.length; i++) {
      const char = trimmed[i];
      if (char === '\\') {
        escaped = !escaped;
        continue;
      }
      if (char === '"' && !escaped) {
        inString = !inString;
      }
      if (!inString) {
        if (char === '{') openCount++;
        if (char === '}') closeCount++;
      }
      escaped = false;
    }

    const startsWithClose = trimmed.startsWith('}');
    const effectiveIndent = startsWithClose ? Math.max(0, indentLevel - 1) : indentLevel;

    result.push(indentString.repeat(effectiveIndent) + trimmed);

    indentLevel += openCount - closeCount;
    indentLevel = Math.max(0, indentLevel);
  }

  return result.join('\n');
};

function App() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [output, setOutput] = useState('');
  const [isError, setIsError] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState('editor'); // 'editor' | 'output'

  // New States
  const [fileName, setFileName] = useState('Main.java');
  const [isEditingFileName, setIsEditingFileName] = useState(false);
  const [tempFileName, setTempFileName] = useState('Main.java');
  const [runner, setRunner] = useState('local'); // 'local' | 'cloud'
  const [isLocalhost, setIsLocalhost] = useState(false);
  const [pollIntervalId, setPollIntervalId] = useState(null);

  // Load from localStorage on mount
  useEffect(() => {
    const savedFileName = localStorage.getItem('web-java-filename');
    if (savedFileName) {
      setFileName(savedFileName);
      setTempFileName(savedFileName);
    }
    const savedCode = localStorage.getItem('web-java-code');
    if (savedCode) {
      setCode(savedCode);
    }

    const isLocal = window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1' || 
                    window.location.hostname === '0.0.0.0';
    setIsLocalhost(isLocal);
    setRunner(isLocal ? 'local' : 'cloud');
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalId) {
        clearInterval(pollIntervalId);
      }
    };
  }, [pollIntervalId]);

  const handleCodeChange = (value) => {
    setCode(value);
    localStorage.setItem('web-java-code', value);
  };

  const handleRename = () => {
    const trimmed = tempFileName.trim();
    if (!trimmed.endsWith('.java')) {
      alert('Filename must end with .java');
      setTempFileName(fileName);
      setIsEditingFileName(false);
      return;
    }

    const className = trimmed.replace(/\.java$/, '');
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(className)) {
      alert('Invalid Java class name');
      setTempFileName(fileName);
      setIsEditingFileName(false);
      return;
    }

    const oldClassName = fileName.replace(/\.java$/, '');

    // Rename class and constructors in editor code
    let updatedCode = code;
    updatedCode = updatedCode.replace(
      new RegExp(`public\\s+class\\s+${oldClassName}\\b`),
      `public class ${className}`
    );
    updatedCode = updatedCode.replace(
      new RegExp(`\\b${oldClassName}\\s*\\(`, 'g'),
      `${className}(`
    );

    setFileName(trimmed);
    setTempFileName(trimmed);
    localStorage.setItem('web-java-filename', trimmed);

    if (updatedCode !== code) {
      setCode(updatedCode);
      localStorage.setItem('web-java-code', updatedCode);
    }
    setIsEditingFileName(false);
  };

  const handleBeautify = () => {
    const formatted = beautifyJava(code);
    setCode(formatted);
    localStorage.setItem('web-java-code', formatted);
  };

  const pollLocalStatus = () => {
    const intervalId = setInterval(async () => {
      try {
        const res = await fetch('/api-local/status');
        if (!res.ok) throw new Error('Failed to fetch status');

        const data = await res.json();
        setOutput(data.output || '');

        if (!data.running) {
          clearInterval(intervalId);
          setPollIntervalId(null);
          setIsRunning(false);
          if (data.exitCode !== null && data.exitCode !== 0) {
            setOutput(prev => prev + `\nProcess finished with exit code ${data.exitCode}`);
            setIsError(true);
          } else if (data.exitCode === 0) {
            setOutput(prev => prev + `\nProcess finished with exit code 0`);
          }
        }
      } catch (err) {
        clearInterval(intervalId);
        setPollIntervalId(null);
        setIsRunning(false);
        setOutput(prev => prev + `\nStatus polling failed: ${err.message}`);
        setIsError(true);
      }
    }, 500);

    setPollIntervalId(intervalId);
  };

  const handleRun = async () => {
    setIsRunning(true);
    setOutput('');
    setIsError(false);
    setActiveTab('output');

    if (runner === 'local') {
      try {
        const response = await fetch('/api-local/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code,
            fileName
          })
        });

        if (!response.ok) {
          throw new Error(`Local compilation failed with HTTP ${response.status}`);
        }

        const data = await response.json();
        if (data.error) {
          setOutput(data.output);
          setIsError(true);
          setIsRunning(false);
          return;
        }

        setOutput('Compiling and running locally...\n');
        pollLocalStatus();

      } catch (err) {
        setOutput(`Local Execution Error: ${err.message}`);
        setIsError(true);
        setIsRunning(false);
      }
    } else {
      // Cloud compilation
      const result = await executeJavaCode(code);
      setOutput(result.output);
      setIsError(result.error);
      setIsRunning(false);
    }
  };

  const handleStop = async () => {
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
      setPollIntervalId(null);
    }
    try {
      await fetch('/api-local/stop', { method: 'POST' });
      setOutput(prev => prev + '\nProcess stopped by user.');
    } catch (err) {
      setOutput(prev => prev + `\nFailed to stop process: ${err.message}`);
    }
    setIsRunning(false);
  };

  return (
    <div className="app-container">
      <header className="header glass">
        <div className="header-title">
          <Code2 size={24} color="var(--accent-color)" />
          Web<span>Java</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {isLocalhost && (
            <div className="runner-settings">
              <select 
                className="runner-select" 
                value={runner}
                onChange={(e) => setRunner(e.target.value)}
                disabled={isRunning}
              >
                <option value="local">Runner: Local (Swing GUI)</option>
                <option value="cloud">Runner: Cloud (Paiza.io)</option>
              </select>
            </div>
          )}

          {!isLocalhost && (
            <div className="runner-settings">
              <span className="runner-badge">Runner: Cloud</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {isRunning && runner === 'local' && (
              <button 
                className="btn btn-danger" 
                onClick={handleStop}
              >
                <Square size={18} />
                Stop Code
              </button>
            )}

            <button 
              className="btn btn-primary" 
              onClick={handleRun}
              disabled={isRunning}
            >
              {isRunning ? <Loader2 size={18} className="animate-spin" style={{ animation: "spin 1s linear infinite" }}/> : <Play size={18} />}
              {isRunning ? 'Running...' : 'Run Code'}
            </button>
          </div>
        </div>
      </header>

      <div className="mobile-tabs">
        <button 
          className={`tab-btn ${activeTab === 'editor' ? 'active' : ''}`}
          onClick={() => setActiveTab('editor')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <Code size={16} /> Editor
          </div>
        </button>
        <button 
          className={`tab-btn ${activeTab === 'output' ? 'active' : ''}`}
          onClick={() => setActiveTab('output')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <Terminal size={16} /> Output
          </div>
        </button>
      </div>

      <main className="main-content">
        <div className={`pane pane-editor ${activeTab === 'editor' ? 'active' : ''}`}>
          <div className="pane-header">
            <div className="filename-container">
              {isEditingFileName ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <input
                    type="text"
                    className="filename-input"
                    value={tempFileName}
                    onChange={(e) => setTempFileName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename();
                      if (e.key === 'Escape') {
                        setTempFileName(fileName);
                        setIsEditingFileName(false);
                      }
                    }}
                    autoFocus
                  />
                  <button onClick={handleRename} style={{ color: 'var(--success-color)', display: 'flex', padding: '0.2rem' }}>
                    <Check size={16} />
                  </button>
                  <button onClick={() => { setTempFileName(fileName); setIsEditingFileName(false); }} style={{ color: 'var(--error-color)', display: 'flex', padding: '0.2rem' }}>
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="filename-display" onClick={() => setIsEditingFileName(true)} title="Click to rename file">
                  <span>{fileName}</span>
                  <Edit2 size={12} style={{ color: 'var(--text-secondary)' }} />
                </div>
              )}
            </div>

            <div className="pane-header-actions">
              <button className="btn-action" onClick={handleBeautify} title="Beautify Java code">
                <Sparkles size={14} color="var(--accent-color)" />
                Beautify
              </button>
            </div>
          </div>
          <div className="editor-wrapper">
            <CodeMirror
              value={code}
              height="100%"
              extensions={[java()]}
              onChange={handleCodeChange}
              theme="dark"
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                dropCursor: true,
                allowMultipleSelections: true,
                indentOnInput: true,
              }}
            />
          </div>
        </div>

        <div className={`pane pane-output ${activeTab === 'output' ? 'active' : ''}`}>
          <div className="pane-header">
            Terminal
          </div>
          {output ? (
            <div className={`output-content ${isError ? 'error' : ''}`}>
              {output}
            </div>
          ) : (
            <div className="output-content empty">
              {isRunning ? 'Compiling and executing...' : 'Run your code to see output here.'}
            </div>
          )}
        </div>
      </main>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default App;
