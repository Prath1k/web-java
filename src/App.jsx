import { useState, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { java } from '@codemirror/lang-java';
import { Play, Terminal, Code2, Loader2, Code } from 'lucide-react';
import { executeJavaCode } from './services/api';

const DEFAULT_CODE = `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, Web Java!");
    }
}`;

function App() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [output, setOutput] = useState('');
  const [isError, setIsError] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState('editor'); // 'editor' | 'output'

  // Load code from localStorage on mount
  useEffect(() => {
    const savedCode = localStorage.getItem('web-java-code');
    if (savedCode) {
      setCode(savedCode);
    }
  }, []);

  const handleCodeChange = (value) => {
    setCode(value);
    localStorage.setItem('web-java-code', value);
  };

  const handleRun = async () => {
    setIsRunning(true);
    setOutput('');
    setIsError(false);
    setActiveTab('output'); // Auto-switch to output on mobile

    const result = await executeJavaCode(code);
    
    setOutput(result.output);
    setIsError(result.error);
    setIsRunning(false);
  };

  return (
    <div className="app-container">
      <header className="header glass">
        <div className="header-title">
          <Code2 size={24} color="var(--accent-color)" />
          Web<span>Java</span>
        </div>
        <button 
          className="btn btn-primary" 
          onClick={handleRun}
          disabled={isRunning}
        >
          {isRunning ? <Loader2 size={18} className="animate-spin" style={{ animation: "spin 1s linear infinite" }}/> : <Play size={18} />}
          {isRunning ? 'Running...' : 'Run Code'}
        </button>
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
            Main.java
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

      {/* Add a simple inline style for the spinner since we don't have tailwind */}
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
