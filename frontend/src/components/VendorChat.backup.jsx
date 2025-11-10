import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { X, Send, AtSign, MessageSquare, List } from 'lucide-react';
import { fetchVendorById, fetchVendorMentions, startVendorChat, getVendorChatMessages, sendVendorChatMessage } from '@/services/api';

import { Response } from '@/components/Response';
const TokenChip = ({ token, onRemove }) => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-gray-300 bg-white text-black">
    {token}
    <button onClick={() => onRemove(token)} className="text-gray-600 hover:text-black">�</button>
  </span>
);
);

export default function VendorChat({ vendorId, open, onClose }) {
  const [chatId, setChatId] = useState(null);
  const [vendor, setVendor] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [tokens, setTokens] = useState([]); // e.g. ["@inv:uuid", "@po:uuid"]
  const [activeTab, setActiveTab] = useState('invoices');
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionKind, setMentionKind] = useState('invoices');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionItems, setMentionItems] = useState([]);
  const listRef = useRef(null);

  // Load vendor details for side lists
  useEffect(() => {
    if (!open || !vendorId) return;
    let cancelled = false;
    fetchVendorById(vendorId).then(v => { if (!cancelled) setVendor(v); }).catch(() => {});
    return () => { cancelled = true; };
  }, [open, vendorId]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  // Ensure a chat exists per vendor when opened
  useEffect(() => {
    if (!open || !vendorId) return;
    let cancelled = false;
    (async () => {
      try {
        const { chatId } = await startVendorChat({ vendorId });
        if (!cancelled) setChatId(chatId);
        const { messages } = await getVendorChatMessages({ vendorId, chatId, limit: 50 });
        if (!cancelled) setMessages(messages);
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, [open, vendorId]);

  // Scroll to bottom on messages change
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  const addToken = useCallback((t) => {
    setTokens(prev => prev.includes(t) ? prev : [...prev, t]);
    setMentionOpen(false);
  }, []);

  const removeToken = useCallback((t) => {
    setTokens(prev => prev.filter(x => x !== t));
  }, []);

  const parseTokens = useCallback(() => {
    const invoices = tokens.filter(t => t.startsWith('@inv:')).map(t => t.slice(5));
    const pos = tokens.filter(t => t.startsWith('@po:')).map(t => t.slice(4));
    return { invoices, pos };
  }, [tokens]);

  // Mention typeahead fetch
  useEffect(() => {
    if (!open || !vendorId || !mentionOpen) return;
    let cancelled = false;
    const kindParam = mentionKind === 'pos' ? 'pos' : 'invoices';
    fetchVendorMentions({ vendorId, kind: kindParam, q: mentionQuery, limit: 8 })
      .then(res => { if (!cancelled) setMentionItems(res.items || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, vendorId, mentionOpen, mentionKind, mentionQuery]);

  const onInputChange = (e) => {
    const val = e.target.value;
    setInput(val);
    const atPos = val.lastIndexOf('@');
    if (atPos >= 0) {
      setMentionQuery(val.slice(atPos + 1));
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const send = async () => {
    if (!input.trim() || !chatId) return;
    const tags = parseTokens();
    const userMsg = { id: 'tmp-'+Date.now(), role: 'user', content: input, tags, createdAt: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    // placeholder assistant message for streaming
    const placeholderId = 'stream-'+Date.now();
    setMessages(prev => [...prev, { id: placeholderId, role: 'assistant', content: '', tags, createdAt: new Date().toISOString(), _streaming: true }]);
    try {
      const res = await fetch(`/api/vendors/${vendorId}/chat/${chatId}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userMsg.content, tags })
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let accum = '';
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // parse SSE-like lines: data: ...\n\n
        const parts = chunk.split(/\n\n/);
        for (const part of parts) {
          const line = part.trim();
          if (!line) continue;
          const prefix = 'data: ';
          const idx = line.indexOf(prefix);
          const payload = idx >= 0 ? line.slice(idx + prefix.length) : line;
          accum += payload;
          setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, content: accum } : m));
        }
        // keep scrolled to bottom
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
      }
      // finalize streaming flag
      setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, _streaming: false } : m));
    } catch (e) {
      setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, content: `Error: ${e.message}`, _streaming: false } : m));
    }
  };

  // Right-side selectable lists
  const invoices = useMemo(() => vendor?.invoices || [], [vendor]);
  const pos = useMemo(() => vendor?.purchaseOrders || [], [vendor]);
  const [selectionKind, setSelectionKind] = useState('invoices');
  const [selected, setSelected] = useState(new Set());
  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  // When selection changes, sync tokens accordingly (single-kind only)
  useEffect(() => {
    const kind = selectionKind === 'pos' ? 'po' : 'inv';
    const base = tokens.filter(t => !t.startsWith(`@${kind}:`));
    const newTokens = [...base, ...Array.from(selected).map(id => `@${kind}:${id}`)];
    setTokens(newTokens);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, selectionKind]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/20">
      <div className="bg-white w-full max-w-5xl h-[80vh] rounded-t-xl sm:rounded-xl border border-gray-200 shadow-xl grid grid-cols-1 lg:grid-cols-3 overflow-hidden">
        {/* Left: Conversation */}
        <div className="lg:col-span-2 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2 text-sm">
              <MessageSquare className="w-4 h-4" />
              <span className="font-medium">Chat with {vendor?.name || 'Vendor'}</span>
            </div>
            <button className="p-1 rounded hover:bg-gray-100" onClick={onClose}><X className="w-5 h-5"/></button>
          </div>
          <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3" onWheelCapture={(e)=>e.stopPropagation()} onTouchMove={(e)=>e.stopPropagation()}>
            {messages.length === 0 ? (
              <div className="text-center text-sm text-gray-500 py-10">No messages yet. Ask a question about this vendor.</div>
            ) : messages.map(m => (
              <div key={m.id} className={`max-w-[85%] ${m.role==='user' ? 'ml-auto text-white bg-black' : 'mr-auto bg-gray-100 text-black'} px-3 py-2 rounded-lg`}>
                <div className="whitespace-pre-wrap text-sm">{m.content}</div>
                {m._streaming && (
                  <div className="mt-1"><ShimmeringText text={"Analyzing context…"} className="text-xs" /></div>
                )}
                { (m.tags?.invoices?.length || m.tags?.pos?.length) ? (
                  <div className="mt-1 flex gap-1 flex-wrap">
                    {(m.tags.invoices||[]).map(id => <TokenChip key={'i'+id} token={`@inv:${id}`} onRemove={()=>{}} />)}
                    {(m.tags.pos||[]).map(id => <TokenChip key={'p'+id} token={`@po:${id}`} onRemove={()=>{}} />)}
                  </div>
                ) : null }
              </div>
            ))}
          </div>
          <div className="border-t border-gray-200 p-3">
            {/* Mention bar */}
            <div className="mb-2 flex gap-2 flex-wrap">
              {tokens.map(t => <TokenChip key={t} token={t} onRemove={removeToken} />)}
            </div>
            <div className="relative">
              <textarea
                value={input}
                onChange={onInputChange}
                onKeyDown={onKeyDown}
                placeholder="Type @ to tag invoices or POs…"
                className="w-full border border-gray-300 rounded-md text-sm p-2 pr-10 min-h-[44px] resize-y focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
              <button onClick={send} className="absolute right-2 bottom-2 p-2 rounded hover:bg-gray-100">
                <Send className="w-4 h-4" />
              </button>
              {mentionOpen && (
                <div className="absolute left-0 bottom-full mb-1 w-full bg-white border border-gray-200 rounded-md shadow z-10">
                  <div className="flex items-center justify-between p-2 border-b border-gray-100 text-xs text-gray-600">
                    <div className="flex items-center gap-2">
                      <AtSign className="w-3.5 h-3.5"/>
                      <span>Tag {mentionKind === 'pos' ? 'POs' : 'Invoices'}</span>
                    </div>
                    <div className="flex gap-1">
                      <button className={`px-2 py-0.5 rounded ${mentionKind==='invoices'?'bg-black text-white':'hover:bg-gray-100'}`} onClick={()=>setMentionKind('invoices')}>Invoices</button>
                      <button className={`px-2 py-0.5 rounded ${mentionKind==='pos'?'bg-black text-white':'hover:bg-gray-100'}`} onClick={()=>setMentionKind('pos')}>POs</button>
                    </div>
                  </div>
                  <div className="max-h-60 overflow-auto">
                    {mentionItems.length===0 ? (
                      <div className="p-2 text-sm text-gray-500">No matches</div>
                    ) : mentionItems.map(item => (
                      <button key={item.id} onClick={()=> addToken(mentionKind==='pos'?`@po:${item.id}`:`@inv:${item.id}`)} className="w-full text-left px-3 py-2 hover:bg-gray-50">
                        <div className="text-sm font-medium">{item.label}</div>
                        <div className="text-xs text-gray-500">{item.meta?.currency || 'USD'} {item.meta?.amount?.toLocaleString?.() || ''} {item.meta?.date?`• ${item.meta.date}`:''}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Selectable lists */}
        <div className="hidden lg:block border-l border-gray-200">
          <div className="p-3 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm"><List className="w-4 h-4"/> Select context</div>
            <div className="flex gap-1 text-xs">
              <button className={`px-2 py-0.5 rounded ${selectionKind==='invoices'?'bg-black text-white':'hover:bg-gray-100'}`} onClick={()=>{setSelectionKind('invoices'); setSelected(new Set());}}>Invoices</button>
              <button className={`px-2 py-0.5 rounded ${selectionKind==='pos'?'bg-black text-white':'hover:bg-gray-100'}`} onClick={()=>{setSelectionKind('pos'); setSelected(new Set());}}>POs</button>
            </div>
          </div>
          <div className="p-3 space-y-2 max-h-full overflow-y-auto">
            {(selectionKind==='invoices' ? invoices : pos).map(item => (
              <label key={item.id} className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={selected.has(item.id)} onChange={()=>toggleSelect(item.id)} />
                <div>
                  <div className="font-medium">{selectionKind==='invoices' ? (item.invoiceNumber || item.id) : (item.poNumber || item.id)}</div>
                  {selectionKind==='invoices' ? (
                    <div className="text-xs text-gray-500">{item.date || ''} • {item.status || ''} • ${Number(item.amount||0).toLocaleString()}</div>
                  ) : (
                    <div className="text-xs text-gray-500">{item.status || ''} • ${Number(item.totalAmount||0).toLocaleString()}</div>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

