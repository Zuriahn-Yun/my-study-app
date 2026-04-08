import { useState, useRef, useEffect } from "react";
import * as idb from "./idb.js";

const CLASS_COLORS = ["#4F46E5","#0891B2","#059669","#D97706","#DC2626","#7C3AED","#DB2777","#0369A1"];
const HAS_FS_ACCESS = typeof window !== "undefined" && "showOpenFilePicker" in window;

const PROVIDERS = {
  claude: {
    id: "claude", label: "Claude", color: "#D97706", bg: "#FEF3C7", textColor: "#92400E", logo: "C",
    keyLabel: "Anthropic API Key", keyPlaceholder: "sk-ant-...", keyHint: "Get key at console.anthropic.com",
    models: [
      { id: "claude-opus-4-5", label: "Claude Opus 4.5", note: "Most capable" },
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", note: "Balanced" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", note: "Fast" },
    ],
  },
  gemini: {
    id: "gemini", label: "Gemini", color: "#4285F4", bg: "#EFF6FF", textColor: "#1E40AF", logo: "G",
    keyLabel: "Google AI API Key", keyPlaceholder: "AIza...", keyHint: "Get key at aistudio.google.com",
    models: [
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", note: "Fast & capable" },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", note: "Long context" },
      { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", note: "Efficient" },
    ],
  },
  openai: {
    id: "openai", label: "Copilot / OpenAI", color: "#10A37F", bg: "#ECFDF5", textColor: "#065F46", logo: "⊕",
    keyLabel: "OpenAI API Key", keyPlaceholder: "sk-...", keyHint: "Get key at platform.openai.com",
    models: [
      { id: "gpt-4o", label: "GPT-4o", note: "Most capable" },
      { id: "gpt-4o-mini", label: "GPT-4o mini", note: "Fast & cheap" },
      { id: "o1-mini", label: "o1 mini", note: "Reasoning" },
    ],
  },
};

function encode64(buffer) {
  let b = ""; const u = new Uint8Array(buffer);
  for (let i = 0; i < u.byteLength; i++) b += String.fromCharCode(u[i]);
  return btoa(b);
}
async function fileToBase64(file) { return encode64(await file.arrayBuffer()); }


async function callClaude({ apiKey, modelId, systemPrompt, messages, books }) {
  const pdfBlocks = books.map(b => ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b.data } }));
  const lastUser = messages[messages.length - 1];
  const apiMessages = [
    ...messages.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
    { role: "user", content: [...pdfBlocks, { type: "text", text: lastUser.content }] },
  ];
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: modelId, max_tokens: 2048, system: systemPrompt, messages: apiMessages }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.map(b => b.text || "").join("") || "";
}

async function callGemini({ apiKey, modelId, systemPrompt, messages, books }) {
  const pdfParts = books.map(b => ({ inline_data: { mime_type: "application/pdf", data: b.data } }));
  const lastUser = messages[messages.length - 1];
  const contents = [
    ...messages.slice(0, -1).map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    { role: "user", parts: [...pdfParts, { text: lastUser.content }] },
  ];
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system_instruction: { parts: [{ text: systemPrompt }] }, contents }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
}

async function callOpenAI({ apiKey, modelId, systemPrompt, messages, books }) {
  const pdfNote = books.length > 0
    ? `[${books.length} PDF(s) referenced: ${books.map(b => b.name).join(", ")}. OpenAI does not accept raw PDF binaries — paste text excerpts from the document for best results.]`
    : "";
  const lastUser = messages[messages.length - 1];
  const apiMessages = [
    { role: "system", content: systemPrompt },
    ...messages.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
    { role: "user", content: pdfNote ? `${pdfNote}\n\n${lastUser.content}` : lastUser.content },
  ];
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model: modelId, max_tokens: 2048, messages: apiMessages }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices?.[0]?.message?.content || "";
}

const BookIcon = ({ size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>;
const SendIcon = ({ size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
const TrashIcon = ({ size = 14 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>;
const FileIcon = ({ size = 14 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
const SettingsIcon = ({ size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
const ChevIcon = ({ size = 14, dir = "right" }) => { const r = { down:90,left:180,up:270,right:0 }[dir]||0; return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform:`rotate(${r}deg)`, transition:"transform 0.2s" }}><polyline points="9 18 15 12 9 6"/></svg>; };
const SpinIcon = ({ size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation:"spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>;
const EyeIcon = ({ size=14, off }) => off
  ? <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
  : <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;

function renderMd(text) {
  return text
    .replace(/^### (.+)$/gm,'<h3 style="font-size:14px;font-weight:500;margin:14px 0 4px;color:var(--color-text-primary)">$1</h3>')
    .replace(/^## (.+)$/gm,'<h2 style="font-size:15px;font-weight:500;margin:18px 0 6px;color:var(--color-text-primary)">$1</h2>')
    .replace(/^# (.+)$/gm,'<h1 style="font-size:17px;font-weight:500;margin:20px 0 8px;color:var(--color-text-primary)">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g,'<strong style="font-weight:500">$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/`(.+?)`/g,'<code style="background:rgba(0,0,0,0.07);padding:1px 5px;border-radius:3px;font-family:monospace;font-size:12px">$1</code>')
    .replace(/^[-•] (.+)$/gm,'<li style="margin:3px 0">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm,'<li style="margin:3px 0;list-style-type:decimal">$2</li>')
    .replace(/(<li[^>]*>.*?<\/li>\n?)+/g,m=>`<ul style="padding-left:18px;margin:6px 0">${m}</ul>`)
    .replace(/\n\n/g,'</p><p style="margin:6px 0">')
    .replace(/\n/g,'<br/>');
}

function SettingsModal({ keys, onSave, onClose, activeProvider, activeModelId, onModelChange }) {
  const [draft, setDraft] = useState({ ...keys });
  const [show, setShow] = useState({});
  const [tab, setTab] = useState(activeProvider);
  function save() { onSave(draft); onClose(); }
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center" }} onClick={onClose}>
      <div style={{ background:"var(--color-background-primary)",borderRadius:14,border:"0.5px solid var(--color-border-secondary)",width:520,maxWidth:"95vw",maxHeight:"88vh",overflow:"auto" }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:"18px 20px 14px",borderBottom:"0.5px solid var(--color-border-tertiary)",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
          <div>
            <p style={{ margin:0,fontWeight:500,fontSize:15,color:"var(--color-text-primary)" }}>AI Model Settings</p>
            <p style={{ margin:"2px 0 0",fontSize:12,color:"var(--color-text-tertiary)" }}>Configure API keys and select your active model</p>
          </div>
          <button onClick={onClose} style={{ background:"none",border:"none",cursor:"pointer",fontSize:22,color:"var(--color-text-tertiary)",lineHeight:1,padding:"0 4px" }}>×</button>
        </div>

        <div style={{ display:"flex",borderBottom:"0.5px solid var(--color-border-tertiary)" }}>
          {Object.values(PROVIDERS).map(p => (
            <button key={p.id} onClick={() => setTab(p.id)} style={{ flex:1,padding:"10px 8px",border:"none",borderBottom:tab===p.id?`2.5px solid ${p.color}`:"2.5px solid transparent",cursor:"pointer",background:"transparent",fontSize:13,fontWeight:tab===p.id?500:400,color:tab===p.id?p.color:"var(--color-text-secondary)",transition:"all 0.15s" }}>
              {p.logo} {p.label}
            </button>
          ))}
        </div>

        {Object.values(PROVIDERS).map(p => tab === p.id && (
          <div key={p.id} style={{ padding:"18px 20px" }}>
            <label style={{ fontSize:12,fontWeight:500,color:"var(--color-text-secondary)",display:"block",marginBottom:6 }}>{p.keyLabel}</label>
            <div style={{ display:"flex",gap:6,marginBottom:4 }}>
              <input type={show[p.id]?"text":"password"} value={draft[p.id]||""} onChange={e=>setDraft(d=>({...d,[p.id]:e.target.value}))} placeholder={p.keyPlaceholder}
                style={{ flex:1,fontSize:13,padding:"8px 10px",border:"0.5px solid var(--color-border-secondary)",borderRadius:8,background:"var(--color-background-secondary)",color:"var(--color-text-primary)",fontFamily:"var(--font-mono)",outline:"none" }} />
              <button onClick={()=>setShow(s=>({...s,[p.id]:!s[p.id]}))} style={{ background:"none",border:"0.5px solid var(--color-border-secondary)",borderRadius:8,padding:"0 10px",cursor:"pointer",color:"var(--color-text-secondary)" }}>
                <EyeIcon size={14} off={show[p.id]} />
              </button>
            </div>
            <p style={{ fontSize:11,color:"var(--color-text-tertiary)",margin:"0 0 18px" }}>{p.keyHint}</p>

            <label style={{ fontSize:12,fontWeight:500,color:"var(--color-text-secondary)",display:"block",marginBottom:8 }}>Choose model</label>
            <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
              {p.models.map(m => {
                const isActive = activeProvider===p.id && activeModelId===m.id;
                return (
                  <button key={m.id} onClick={()=>onModelChange(p.id,m.id)} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderRadius:8,cursor:"pointer",border:isActive?`1.5px solid ${p.color}`:"0.5px solid var(--color-border-tertiary)",background:isActive?p.bg:"var(--color-background-secondary)",transition:"all 0.15s" }}>
                    <div style={{ textAlign:"left" }}>
                      <p style={{ margin:0,fontSize:13,fontWeight:500,color:isActive?p.textColor:"var(--color-text-primary)" }}>{m.label}</p>
                      <p style={{ margin:0,fontSize:11,color:isActive?p.color:"var(--color-text-tertiary)" }}>{m.note}</p>
                    </div>
                    {isActive && <span style={{ width:8,height:8,borderRadius:"50%",background:p.color,flexShrink:0 }}/>}
                  </button>
                );
              })}
            </div>
            {p.id==="openai" && (
              <div style={{ marginTop:14,padding:"10px 14px",background:"var(--color-background-secondary)",borderRadius:8,border:"0.5px solid var(--color-border-tertiary)" }}>
                <p style={{ margin:0,fontSize:12,color:"var(--color-text-secondary)" }}>⚠️ OpenAI does not support raw PDF binary uploads. The app will include file names and a prompt to paste relevant text excerpts.</p>
              </div>
            )}
          </div>
        ))}

        <div style={{ padding:"14px 20px",borderTop:"0.5px solid var(--color-border-tertiary)",display:"flex",justifyContent:"flex-end",gap:8 }}>
          <button onClick={onClose} style={{ padding:"8px 16px",fontSize:13,border:"0.5px solid var(--color-border-secondary)",borderRadius:8,cursor:"pointer",background:"transparent",color:"var(--color-text-secondary)" }}>Cancel</button>
          <button onClick={save} style={{ padding:"8px 20px",fontSize:13,border:"none",borderRadius:8,cursor:"pointer",background:"#4F46E5",color:"white",fontWeight:500 }}>Save</button>
        </div>
      </div>
    </div>
  );
}

function ModelSwitcher({ activeProvider, activeModelId, onModelChange, onOpenSettings }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const ap = PROVIDERS[activeProvider];
  const am = ap?.models.find(m => m.id === activeModelId);
  return (
    <div ref={ref} style={{ position:"relative" }}>
      <button onClick={()=>setOpen(o=>!o)} style={{ display:"flex",alignItems:"center",gap:7,padding:"6px 10px 6px 8px",border:"0.5px solid var(--color-border-secondary)",borderRadius:8,cursor:"pointer",background:"var(--color-background-primary)",fontSize:12,color:"var(--color-text-secondary)",transition:"all 0.15s" }}>
        <span style={{ width:20,height:20,borderRadius:5,background:ap?.bg,border:`1px solid ${ap?.color}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:ap?.color }}>
          {ap?.logo}
        </span>
        <span style={{ fontWeight:500,color:"var(--color-text-primary)",maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{am?.label||ap?.label}</span>
        <ChevIcon size={12} dir={open?"up":"down"} />
      </button>

      {open && (
        <div style={{ position:"absolute",top:"calc(100% + 6px)",left:0,background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:10,zIndex:50,minWidth:250,overflow:"hidden",boxShadow:"0 8px 30px rgba(0,0,0,0.12)" }}>
          {Object.values(PROVIDERS).map(p => (
            <div key={p.id}>
              <div style={{ padding:"8px 12px 3px",display:"flex",alignItems:"center",gap:6 }}>
                <span style={{ fontSize:10,fontWeight:600,color:p.color,background:p.bg,padding:"1px 7px",borderRadius:4 }}>{p.label}</span>
                {p.id==="openai" && <span style={{ fontSize:10,color:"var(--color-text-tertiary)" }}>text only</span>}
              </div>
              {p.models.map(m => {
                const isActive = activeProvider===p.id && activeModelId===m.id;
                return (
                  <button key={m.id} onClick={()=>{onModelChange(p.id,m.id);setOpen(false);}} style={{ width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 14px 7px 20px",border:"none",cursor:"pointer",background:isActive?p.bg:"transparent",transition:"background 0.1s",textAlign:"left" }}
                    onMouseEnter={e=>{if(!isActive)e.currentTarget.style.background="var(--color-background-secondary)";}}
                    onMouseLeave={e=>{if(!isActive)e.currentTarget.style.background="transparent";}}>
                    <div>
                      <span style={{ fontSize:13,fontWeight:isActive?500:400,color:isActive?p.textColor:"var(--color-text-primary)",display:"block" }}>{m.label}</span>
                      <span style={{ fontSize:11,color:isActive?p.color:"var(--color-text-tertiary)" }}>{m.note}</span>
                    </div>
                    {isActive && <span style={{ width:6,height:6,borderRadius:"50%",background:p.color }}/>}
                  </button>
                );
              })}
            </div>
          ))}
          <div style={{ borderTop:"0.5px solid var(--color-border-tertiary)",padding:"5px 7px" }}>
            <button onClick={()=>{onOpenSettings();setOpen(false);}} style={{ width:"100%",display:"flex",alignItems:"center",gap:7,padding:"7px 10px",border:"none",cursor:"pointer",background:"transparent",borderRadius:6,color:"var(--color-text-secondary)",fontSize:12 }}
              onMouseEnter={e=>e.currentTarget.style.background="var(--color-background-secondary)"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <SettingsIcon size={13}/> Manage API keys
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [classes, setClasses] = useState([]);
  const [activeClassId, setActiveClassId] = useState(null);
  const [activeBookIds, setActiveBookIds] = useState([]);
  const [chat, setChat] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [showNewClass, setShowNewClass] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [expandedClasses, setExpandedClasses] = useState({});
  const [dragOver, setDragOver] = useState(false);
  const [uploadingClass, setUploadingClass] = useState(null);
  const [pageRange, setPageRange] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeys, setApiKeys] = useState({});
  const [activeProvider, setActiveProvider] = useState("claude");
  const [activeModelId, setActiveModelId] = useState("claude-sonnet-4-5");
  const fileInputRef = useRef();
  const chatEndRef = useRef();
  const textareaRef = useRef();

  // Load all data from IndexedDB on mount (removed offset editing state — use plain page range input)
  useEffect(() => {
    async function load() {
      try {
        const [savedClasses, savedMessages, savedKeys, savedModel] = await Promise.all([
          idb.getClasses(),
          idb.getMessages(),
          idb.getSetting("apiKeys"),
          idb.getSetting("activeModel"),
        ]);
        if (savedClasses.length > 0) {
          setClasses(savedClasses);
          setActiveClassId(savedClasses[0].id);
          setExpandedClasses({ [savedClasses[0].id]: true });
        }
        if (savedMessages.length > 0) setChat(savedMessages);
        if (savedKeys) setApiKeys(savedKeys);
        if (savedModel) { setActiveProvider(savedModel.provider); setActiveModelId(savedModel.model); }
      } catch (err) {
        console.error("IndexedDB load error:", err);
      } finally {
        setInitializing(false);
      }
    }
    load();
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat, loading]);

  function saveKeys(keys) { setApiKeys(keys); idb.setSetting("apiKeys", keys); }
  function changeModel(prov, mod) {
    setActiveProvider(prov); setActiveModelId(mod);
    idb.setSetting("activeModel", { provider: prov, model: mod });
  }

  const activeClass = classes.find(c => c.id === activeClassId);
  const selectedBooks = activeClass?.books.filter(b => activeBookIds.includes(b.id)) || [];
  const ap = PROVIDERS[activeProvider];
  const hasKey = !!apiKeys[activeProvider];

  function createClass() {
    if (!newClassName.trim()) return;
    const id = Date.now().toString();
    const color = CLASS_COLORS[classes.length % CLASS_COLORS.length];
    const newClass = { id, name: newClassName.trim(), color, books: [] };
    setClasses(prev => [...prev, newClass]);
    idb.putClass(newClass);
    setActiveClassId(id);
    setExpandedClasses(prev => ({ ...prev, [id]: true }));
    setNewClassName(""); setShowNewClass(false);
  }

  function deleteClass(id) {
    setClasses(prev => prev.filter(c => c.id !== id));
    idb.removeClass(id);
    if (activeClassId === id) {
      const remaining = classes.filter(c => c.id !== id);
      setActiveClassId(remaining[0]?.id || null);
    }
  }

  // Open the native file picker (File System Access API) or fall back to <input>
  async function pickFiles(classId) {
    if (HAS_FS_ACCESS) {
      try {
        const handles = await window.showOpenFilePicker({
          multiple: true,
          types: [{ description: "PDF files", accept: { "application/pdf": [".pdf"] } }],
        });
        await addBooks(handles, classId);
      } catch (err) {
        if (err.name !== "AbortError") console.error("File picker error:", err);
      }
    } else {
      setActiveClassId(classId);
      fileInputRef.current?.click();
    }
  }

  // accepts FileSystemFileHandle[] (FS Access API) or File[] (fallback)
  async function addBooks(items, classId) {
    const targetId = classId || activeClassId;
    if (!targetId) return;
    setUploadingClass(targetId);

    const newBooks = [];
    for (const item of items) {
      const isHandle = typeof item.getFile === "function";
      if (isHandle) {
        if (!item.name.toLowerCase().endsWith(".pdf")) continue;
        try {
          const file = await item.getFile();
          newBooks.push({ id: Date.now().toString() + Math.random(), name: item.name, size: file.size, handle: item, pageOffset: 0 });
        } catch (err) { console.warn("Could not read handle:", err); }
      } else {
        if (!item.type.includes("pdf")) continue;
        try {
          const data = await fileToBase64(item);
          newBooks.push({ id: Date.now().toString() + Math.random(), name: item.name, size: item.size, data, pageOffset: 0 });
        } catch (err) { console.warn("Could not read file:", err); }
      }
    }

    const targetClass = classes.find(c => c.id === targetId);
    if (targetClass && newBooks.length > 0) {
      const updatedClass = { ...targetClass, books: [...targetClass.books, ...newBooks] };
      setClasses(prev => prev.map(c => c.id === targetId ? updatedClass : c));
      idb.putClass(updatedClass);
    }
    setUploadingClass(null);
  }

  function deleteBook(classId, bookId) {
    const targetClass = classes.find(c => c.id === classId);
    if (!targetClass) return;
    const updatedClass = { ...targetClass, books: targetClass.books.filter(b => b.id !== bookId) };
    setClasses(prev => prev.map(c => c.id === classId ? updatedClass : c));
    idb.putClass(updatedClass);
    setActiveBookIds(prev => prev.filter(id => id !== bookId));
  }

  function toggleBook(bookId) { setActiveBookIds(prev => prev.includes(bookId) ? prev.filter(id => id !== bookId) : [...prev, bookId]); }
  function toggleExpand(classId) { setExpandedClasses(prev => ({ ...prev, [classId]: !prev[classId] })); setActiveClassId(classId); setActiveBookIds([]); }

  async function sendMessage() {
    if (!input.trim() || loading) return;
    if (selectedBooks.length === 0) return;
    if (!apiKeys[activeProvider]) { setShowSettings(true); return; }

    const content = pageRange ? `[Focus only on the pages where the printed page number is ${pageRange}. Use the number physically printed on the page, not the PDF file's sequential position.]\n\n${input.trim()}` : input.trim();
    const userMsg = { role: "user", content, provider: activeProvider, model: activeModelId };
    idb.addMessage(userMsg);
    const newChat = [...chat, userMsg];
    setChat(newChat); setInput(""); setLoading(true);

    // Read file content for each selected book. For handle-based books, verify
    // permission (required after page reloads) and read the file fresh from disk.
    const booksWithData = [];
    for (const book of selectedBooks) {
      if (book.data) { booksWithData.push(book); continue; }
      if (!book.handle) continue;

      let perm = await book.handle.queryPermission({ mode: "read" });
      if (perm === "prompt") perm = await book.handle.requestPermission({ mode: "read" });
      if (perm !== "granted") {
        const errMsg = { role: "assistant", content: `**File access denied** for "${book.name}". Re-add the file to continue.`, provider: activeProvider, model: activeModelId };
        idb.addMessage(errMsg);
        setChat(prev => [...prev, errMsg]);
        setLoading(false); return;
      }
      try {
        const file = await book.handle.getFile();
        const data = await fileToBase64(file);
        booksWithData.push({ ...book, data });
      } catch (err) {
        const errMsg = { role: "assistant", content: `**Could not read** "${book.name}": ${err.message}`, provider: activeProvider, model: activeModelId };
        idb.addMessage(errMsg);
        setChat(prev => [...prev, errMsg]);
        setLoading(false); return;
      }
    }

    const systemPrompt = `You are an expert academic assistant analyzing books and PDFs. Documents: ${selectedBooks.map(b => b.name).join(", ")}. When the user specifies a page range, always refer to the page numbers physically printed on the pages — never use the sequential position of a page within the PDF file. Provide clear, well-structured analysis. Extract key concepts. Use markdown formatting for readability.`;

    try {
      let resp = "";
      const args = { apiKey: apiKeys[activeProvider], modelId: activeModelId, systemPrompt, messages: newChat.map(m => ({ role: m.role, content: m.content })), books: booksWithData };
      if (activeProvider === "claude") resp = await callClaude(args);
      else if (activeProvider === "gemini") resp = await callGemini(args);
      else if (activeProvider === "openai") resp = await callOpenAI(args);
      const aiMsg = { role: "assistant", content: resp, provider: activeProvider, model: activeModelId };
      idb.addMessage(aiMsg);
      setChat(prev => [...prev, aiMsg]);
    } catch (err) {
      const errMsg = { role: "assistant", content: `**Error:** ${err.message || "Check your API key in Settings."}`, provider: activeProvider, model: activeModelId };
      idb.addMessage(errMsg);
      setChat(prev => [...prev, errMsg]);
    }
    setLoading(false);
  }

  function handleKeyDown(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }

  const quickPrompts = [
    "Summarize the main themes and key arguments",
    "What are the most important concepts to know?",
    "Create detailed study notes with bullet points",
    "Explain the structure and organization of the material",
    "What are the key definitions and technical terms?",
    "Compare and contrast the main ideas presented",
  ];

  if (initializing) {
    return (
      <div style={{ display:"flex",height:"100vh",alignItems:"center",justifyContent:"center",background:"var(--color-background-tertiary)",fontFamily:"var(--font-sans)" }}>
        <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:12 }}>
          <SpinIcon size={24}/>
          <span style={{ fontSize:13,color:"var(--color-text-tertiary)" }}>Loading your library…</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display:"flex",height:"100vh",fontFamily:"var(--font-sans)",background:"var(--color-background-tertiary)",overflow:"hidden" }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,80%,100%{opacity:.3}40%{opacity:1}}
        .msg-in{animation:fadeUp 0.18s ease}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--color-border-secondary);border-radius:2px}
        .hov:hover{background:var(--color-background-secondary)!important}
        textarea{resize:none;outline:none;border:none;background:transparent;width:100%;font-family:var(--font-sans);font-size:14px;color:var(--color-text-primary);line-height:1.5}
        textarea::placeholder{color:var(--color-text-tertiary)}
      `}</style>

      {showSettings && <SettingsModal keys={apiKeys} onSave={saveKeys} onClose={()=>setShowSettings(false)} activeProvider={activeProvider} activeModelId={activeModelId} onModelChange={changeModel}/>}

      {/* Browser compatibility notice */}
      {!HAS_FS_ACCESS && (
        <div style={{ position:"fixed",bottom:12,left:"50%",transform:"translateX(-50%)",zIndex:90,background:"#FEF3C7",border:"0.5px solid #F59E0B60",borderRadius:8,padding:"7px 14px",fontSize:12,color:"#92400E",whiteSpace:"nowrap",boxShadow:"0 2px 12px rgba(0,0,0,0.1)" }}>
          Use Chrome or Edge for local file references — PDFs will be stored in-browser on this browser.
        </div>
      )}

      {/* Sidebar */}
      <div style={{ width:256,background:"var(--color-background-primary)",borderRight:"0.5px solid var(--color-border-tertiary)",display:"flex",flexDirection:"column",flexShrink:0 }}>
        <div style={{ padding:"14px 14px 10px",borderBottom:"0.5px solid var(--color-border-tertiary)" }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10 }}>
            <div style={{ display:"flex",alignItems:"center",gap:7 }}>
              <BookIcon size={15}/><span style={{ fontSize:13,fontWeight:500,color:"var(--color-text-primary)" }}>Study Library</span>
            </div>
            <div style={{ display:"flex",gap:4 }}>
              <button onClick={()=>setShowSettings(true)} title="Settings" style={{ background:"none",border:"0.5px solid var(--color-border-tertiary)",borderRadius:6,padding:"4px 6px",cursor:"pointer",color:"var(--color-text-tertiary)",display:"flex" }}><SettingsIcon size={13}/></button>
              <button onClick={()=>setShowNewClass(true)} style={{ background:"none",border:"0.5px solid var(--color-border-secondary)",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:12,color:"var(--color-text-secondary)" }}>+ Class</button>
            </div>
          </div>
          {showNewClass && (
            <div style={{ display:"flex",gap:5 }}>
              <input autoFocus value={newClassName} onChange={e=>setNewClassName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")createClass();if(e.key==="Escape")setShowNewClass(false);}} placeholder="Class name..."
                style={{ flex:1,fontSize:13,padding:"5px 8px",border:"0.5px solid var(--color-border-primary)",borderRadius:6,background:"var(--color-background-secondary)",color:"var(--color-text-primary)",outline:"none",fontFamily:"var(--font-sans)" }}/>
              <button onClick={createClass} style={{ background:"#4F46E5",color:"white",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:12,fontWeight:500 }}>Add</button>
            </div>
          )}
        </div>

        <div style={{ flex:1,overflowY:"auto",padding:"6px 0" }}>
          {classes.length === 0 && <div style={{ padding:"28px 16px",textAlign:"center",color:"var(--color-text-tertiary)",fontSize:12 }}>Create a class to get started</div>}
          {classes.map(cls => (
            <div key={cls.id}>
              <div className="hov" onClick={()=>toggleExpand(cls.id)} style={{ display:"flex",alignItems:"center",gap:7,padding:"7px 10px 7px 12px",cursor:"pointer",borderLeft:activeClassId===cls.id?`2.5px solid ${cls.color}`:"2.5px solid transparent",transition:"all 0.12s" }}>
                <div style={{ width:7,height:7,borderRadius:"50%",background:cls.color,flexShrink:0 }}/>
                <span style={{ flex:1,fontSize:13,fontWeight:activeClassId===cls.id?500:400,color:"var(--color-text-primary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{cls.name}</span>
                <span style={{ fontSize:10,color:"var(--color-text-tertiary)" }}>{cls.books.length}</span>
                <ChevIcon size={11} dir={expandedClasses[cls.id]?"down":"right"}/>
                <button onClick={e=>{e.stopPropagation();deleteClass(cls.id);}} style={{ background:"none",border:"none",cursor:"pointer",color:"var(--color-text-tertiary)",padding:2,display:"flex",opacity:0.5 }}><TrashIcon size={11}/></button>
              </div>

              {expandedClasses[cls.id] && (
                <div style={{ paddingLeft:6 }}>
                  {cls.books.map(book => (
                    <div key={book.id} className="hov" onClick={()=>{setActiveClassId(cls.id);toggleBook(book.id);}} style={{ display:"flex",alignItems:"center",gap:6,padding:"5px 10px 5px 20px",cursor:"pointer",borderRadius:6,margin:"1px 5px" }}>
                      <input type="checkbox" checked={activeBookIds.includes(book.id) && activeClassId===cls.id} onChange={()=>{}} style={{ accentColor:cls.color,cursor:"pointer",flexShrink:0,width:13,height:13 }} onClick={e=>e.stopPropagation()}/>
                      <FileIcon size={11}/>
                      <span style={{ flex:1,fontSize:12,color:"var(--color-text-secondary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }} title={book.name}>{book.name.replace(".pdf","")}</span>

                      <button onClick={e=>{e.stopPropagation();deleteBook(cls.id,book.id);}} style={{ background:"none",border:"none",cursor:"pointer",color:"var(--color-text-tertiary)",padding:1,display:"flex",opacity:0,flexShrink:0 }}
                        onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0}><TrashIcon size={10}/></button>
                    </div>
                  ))}

                  {/* Drop zone / add button */}
                  <div
                    onDragOver={e=>{e.preventDefault();setDragOver(true);setUploadingClass(cls.id);}}
                    onDragLeave={()=>{setDragOver(false);setUploadingClass(null);}}
                    onDrop={async e=>{
                      e.preventDefault(); setDragOver(false);
                      if (HAS_FS_ACCESS) {
                        try {
                          const handles = await Promise.all(
                            [...e.dataTransfer.items]
                              .filter(i => i.kind === "file")
                              .map(i => i.getAsFileSystemHandle())
                          );
                          await addBooks(handles.filter(h => h.kind === "file"), cls.id);
                        } catch {
                          await addBooks([...e.dataTransfer.files], cls.id);
                        }
                      } else {
                        await addBooks([...e.dataTransfer.files], cls.id);
                      }
                    }}
                    onClick={()=>pickFiles(cls.id)}
                    style={{ margin:"3px 7px 8px",padding:"7px",border:`1px dashed ${dragOver&&uploadingClass===cls.id?cls.color:"var(--color-border-tertiary)"}`,borderRadius:6,cursor:"pointer",textAlign:"center",transition:"all 0.15s",background:dragOver&&uploadingClass===cls.id?`${cls.color}11`:"transparent" }}>
                    {uploadingClass===cls.id
                      ? <span style={{ fontSize:11,color:"var(--color-text-tertiary)",display:"flex",alignItems:"center",justifyContent:"center",gap:4 }}><SpinIcon size={10}/>Adding…</span>
                      : <span style={{ fontSize:11,color:"var(--color-text-tertiary)" }}>+ Add PDFs</span>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        {/* Fallback file input for non-FS-Access browsers */}
        <input ref={fileInputRef} type="file" accept=".pdf" multiple style={{ display:"none" }} onChange={e=>{addBooks(Array.from(e.target.files));e.target.value="";}}/>
      </div>

      {/* Main */}
      <div style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden" }}>
        {/* Header */}
        <div style={{ background:"var(--color-background-primary)",borderBottom:"0.5px solid var(--color-border-tertiary)",padding:"10px 18px",display:"flex",alignItems:"center",gap:10,flexShrink:0,flexWrap:"wrap" }}>
          <div style={{ display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0,overflow:"hidden" }}>
            {activeClass ? (
              <>
                <div style={{ width:8,height:8,borderRadius:"50%",background:activeClass.color,flexShrink:0 }}/>
                <span style={{ fontWeight:500,fontSize:14,color:"var(--color-text-primary)",whiteSpace:"nowrap" }}>{activeClass.name}</span>
                <span style={{ fontSize:12,color:"var(--color-text-tertiary)",whiteSpace:"nowrap" }}>{selectedBooks.length===0?"— select books":`${selectedBooks.length} book${selectedBooks.length!==1?"s":""}`}</span>
                {selectedBooks.map(b => (
                  <span key={b.id} style={{ fontSize:11,background:`${activeClass.color}18`,color:activeClass.color,padding:"2px 7px",borderRadius:10,border:`0.5px solid ${activeClass.color}35`,whiteSpace:"nowrap" }}>
                    {b.name.replace(".pdf","")}
                  </span>
                ))}
              </>
            ) : (
              <span style={{ fontSize:13,color:"var(--color-text-tertiary)" }}>Select a class to begin</span>
            )}
          </div>

          <div style={{ display:"flex",alignItems:"center",gap:8,flexShrink:0 }}>
            <ModelSwitcher activeProvider={activeProvider} activeModelId={activeModelId} onModelChange={changeModel} onOpenSettings={()=>setShowSettings(true)}/>
            {!hasKey && (
              <button onClick={()=>setShowSettings(true)} style={{ fontSize:11,padding:"4px 10px",background:"#FEF3C7",color:"#92400E",border:"0.5px solid #F59E0B50",borderRadius:6,cursor:"pointer",whiteSpace:"nowrap" }}>⚠ Add key</button>
            )}
            {selectedBooks.length > 0 && (<>
              <input value={pageRange} onChange={e=>setPageRange(e.target.value)} placeholder="Pages e.g. 5-20"
                title="Focus the AI on specific pages — type a page number or range like 5-20"
                style={{ width:130,fontSize:12,padding:"4px 9px",border:"0.5px solid var(--color-border-secondary)",borderRadius:6,background:"var(--color-background-secondary)",color:"var(--color-text-primary)",fontFamily:"var(--font-sans)",outline:"none" }}/>
              <button onClick={()=>{setChat([]);idb.clearMessages();}} style={{ fontSize:12,padding:"4px 10px",border:"0.5px solid var(--color-border-secondary)",borderRadius:6,background:"transparent",cursor:"pointer",color:"var(--color-text-secondary)",whiteSpace:"nowrap" }}>Clear</button>
            </>)}
          </div>
        </div>

        {/* Chat area */}
        <div style={{ flex:1,overflowY:"auto",padding:"20px 20px 10px" }}>
          {chat.length===0 && selectedBooks.length===0 && (
            <div style={{ textAlign:"center",paddingTop:56 }}>
              <div style={{ width:52,height:52,borderRadius:14,background:"var(--color-background-secondary)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px" }}><BookIcon size={26}/></div>
              <p style={{ fontSize:16,fontWeight:500,color:"var(--color-text-primary)",margin:"0 0 6px" }}>Book Analysis Pipeline</p>
              <p style={{ fontSize:13,color:"var(--color-text-secondary)",margin:"0 0 22px",maxWidth:360,marginLeft:"auto",marginRight:"auto" }}>
                Create a class, add PDFs, select books, then ask anything.
                {HAS_FS_ACCESS ? " PDFs stay on your device — only read when you send a message." : ""}
              </p>
              <div style={{ display:"flex",justifyContent:"center",gap:8,flexWrap:"wrap" }}>
                {Object.values(PROVIDERS).map(p => (
                  <div key={p.id} style={{ display:"flex",alignItems:"center",gap:6,padding:"5px 12px",background:p.bg,border:`0.5px solid ${p.color}40`,borderRadius:8 }}>
                    <span style={{ fontSize:12,fontWeight:700,color:p.color }}>{p.logo}</span>
                    <span style={{ fontSize:12,color:p.textColor }}>{p.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {chat.length===0 && selectedBooks.length > 0 && (
            <div style={{ maxWidth:640,margin:"0 auto" }}>
              <p style={{ fontSize:12,color:"var(--color-text-tertiary)",marginBottom:10 }}>Quick prompts — using <span style={{ fontWeight:500,color:ap.color }}>{PROVIDERS[activeProvider].models.find(m=>m.id===activeModelId)?.label}</span></p>
              <div style={{ display:"flex",flexDirection:"column",gap:5 }}>
                {quickPrompts.map((p,i) => (
                  <button key={i} className="hov" onClick={()=>{setInput(p);textareaRef.current?.focus();}} style={{ textAlign:"left",padding:"9px 13px",border:"0.5px solid var(--color-border-tertiary)",borderRadius:8,cursor:"pointer",background:"var(--color-background-primary)",fontSize:13,color:"var(--color-text-primary)",transition:"all 0.12s" }}>{p}</button>
                ))}
              </div>
            </div>
          )}

          <div style={{ maxWidth:760,margin:"0 auto",display:"flex",flexDirection:"column",gap:14 }}>
            {chat.map((msg,i) => {
              const mp = PROVIDERS[msg.provider] || ap;
              const mm = mp.models?.find(m => m.id === msg.model);
              return (
                <div key={i} className="msg-in" style={{ display:"flex",justifyContent:msg.role==="user"?"flex-end":"flex-start",flexDirection:msg.role==="user"?"row":"column" }}>
                  {msg.role==="assistant" && (
                    <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:5 }}>
                      <div style={{ width:22,height:22,borderRadius:6,background:mp.bg,border:`1px solid ${mp.color}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:mp.color }}>{mp.logo}</div>
                      <span style={{ fontSize:11,color:"var(--color-text-tertiary)" }}>{mm?.label||mp.label}</span>
                    </div>
                  )}
                  <div style={{ maxWidth:msg.role==="user"?"72%":"100%",padding:msg.role==="user"?"9px 13px":"11px 15px",background:msg.role==="user"?(activeClass?.color||"#4F46E5"):"var(--color-background-primary)",color:msg.role==="user"?"white":"var(--color-text-primary)",borderRadius:msg.role==="user"?"13px 13px 4px 13px":"4px 13px 13px 13px",border:msg.role==="assistant"?"0.5px solid var(--color-border-tertiary)":"none",fontSize:14,lineHeight:1.6 }}>
                    {msg.role==="assistant" ? <div dangerouslySetInnerHTML={{__html:renderMd(msg.content)}}/> : msg.content}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="msg-in" style={{ display:"flex",flexDirection:"column" }}>
                <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:5 }}>
                  <div style={{ width:22,height:22,borderRadius:6,background:ap.bg,border:`1px solid ${ap.color}40`,display:"flex",alignItems:"center",justifyContent:"center" }}><SpinIcon size={11}/></div>
                  <span style={{ fontSize:11,color:"var(--color-text-tertiary)" }}>{PROVIDERS[activeProvider].models.find(m=>m.id===activeModelId)?.label} is analyzing…</span>
                </div>
                <div style={{ padding:"10px 14px",background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"4px 13px 13px 13px",display:"flex",gap:5,alignItems:"center" }}>
                  {[0,0.2,0.4].map((d,i) => <span key={i} style={{ display:"inline-block",width:6,height:6,borderRadius:"50%",background:ap.color,animation:`pulse 1.2s ease ${d}s infinite`}}/>)}
                </div>
              </div>
            )}
            <div ref={chatEndRef}/>
          </div>
        </div>

        {/* Input bar */}
        <div style={{ borderTop:"0.5px solid var(--color-border-tertiary)",background:"var(--color-background-primary)",padding:"10px 18px 14px",flexShrink:0 }}>
          <div style={{ maxWidth:760,margin:"0 auto" }}>
            {selectedBooks.length===0 ? (
              <div style={{ textAlign:"center",padding:"10px",fontSize:13,color:"var(--color-text-tertiary)" }}>Select books from the sidebar to start analyzing</div>
            ) : !hasKey ? (
              <div style={{ textAlign:"center",padding:"10px" }}>
                <button onClick={()=>setShowSettings(true)} style={{ fontSize:13,padding:"8px 20px",background:ap.bg,color:ap.textColor,border:`1px solid ${ap.color}50`,borderRadius:8,cursor:"pointer",fontWeight:500 }}>Add {ap.label} API key to start →</button>
              </div>
            ) : (
              <div style={{ display:"flex",gap:8,alignItems:"flex-end",border:"0.5px solid var(--color-border-secondary)",borderRadius:12,padding:"9px 12px",background:"var(--color-background-secondary)" }}>
                <div style={{ width:22,height:22,borderRadius:6,background:ap.bg,border:`1px solid ${ap.color}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:ap.color,flexShrink:0,marginBottom:1 }}>{ap.logo}</div>
                <textarea ref={textareaRef} value={input} onChange={e=>{setInput(e.target.value);e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,160)+"px";}} onKeyDown={handleKeyDown} placeholder={`Ask ${ap.label} about your books… (Enter to send)`} rows={1} style={{ maxHeight:160 }}/>
                <button onClick={sendMessage} disabled={!input.trim()||loading} style={{ background:activeClass?.color||"#4F46E5",border:"none",borderRadius:8,padding:"7px 9px",cursor:input.trim()&&!loading?"pointer":"not-allowed",opacity:input.trim()&&!loading?1:0.35,color:"white",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"opacity 0.15s" }}><SendIcon size={14}/></button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
