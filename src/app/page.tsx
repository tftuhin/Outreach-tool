"use client";

import { useState, useEffect } from "react";
import Papa from "papaparse";
import dynamic from "next/dynamic";
import DOMPurify from "isomorphic-dompurify";
import "react-quill-new/dist/quill.snow.css";

const ReactQuill = dynamic(() => import("react-quill-new"), { ssr: false });

const getFirstUrl = (text: string | undefined | null) => {
  if (!text) return undefined;
  const match = text.match(/(https?:\/\/[^\s)]+)/);
  return match ? match[1] : undefined;
};

const extractPhone = (str: string | undefined | null) => {
  if (!str) return '';
  const match = str.match(/\+?\d[\d\s-]{7,}\d/);
  return match ? match[0].trim() : '';
};

const cleanPhone = (phone: string) => phone.replace(/[^0-9+]/g, '');

const formatForQuill = (text: string | undefined | null) => {
  if (!text) return '';
  let str = text.replace(/—/g, '-');
  // If it doesn't contain <p> or <br> tags, replace newlines with <br>
  if (!/<\/?(p|br)\b/i.test(str)) {
    return str.replace(/\n/g, '<br/>');
  }
  return str;
};

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{cursor:'pointer', marginLeft:'6px', color:'var(--muted)'}}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);

const stripMessageTrail = (text: string): { cleanBody: string; trail?: string } => {
  if (!text) return { cleanBody: '' };
  const normalized = text.replace(/—/g, '-');

  const headerPatterns = [
    /\r?\n\s*On\s+[\s\S]{1,300}?wrote:\s*(\r?\n|$)/i,
    /\r?\n\s*-+\s*Original Message\s*-+/i,
    /\r?\n\s*From:\s*[^\n]+\r?\n\s*(?:Sent|Date):\s*[^\n]+\r?\n\s*To:\s*[^\n]+/i,
    /\r?\n_{15,}\r?\n/,
    /\r?\n\s*-+\s*Forwarded message\s*-+/i,
    /\r?\n\s*Begin forwarded message:\s*/i
  ];

  for (const pattern of headerPatterns) {
    const match = pattern.exec(normalized);
    if (match && match.index !== undefined) {
      const before = normalized.substring(0, match.index).trim();
      const after = normalized.substring(match.index).trim();
      if (before.length > 0) {
        return { cleanBody: before, trail: after };
      }
    }
  }

  const lines = normalized.split(/\r?\n/);
  const firstQuoteIdx = lines.findIndex(l => l.trim().startsWith('>'));
  if (firstQuoteIdx > 0) {
    const before = lines.slice(0, firstQuoteIdx).join('\n').trim();
    const after = lines.slice(firstQuoteIdx).join('\n').trim();
    if (before.length > 0) {
      return { cleanBody: before, trail: after };
    }
  } else if (firstQuoteIdx === 0) {
    const nonQuoteLines: string[] = [];
    const quoteLines: string[] = [];
    for (const line of lines) {
      if (line.trim().startsWith('>') || /^\s*On\s+[\s\S]+?wrote:\s*$/i.test(line)) {
        quoteLines.push(line);
      } else {
        nonQuoteLines.push(line);
      }
    }
    const clean = nonQuoteLines.join('\n').trim();
    if (clean.length > 0) {
      return { cleanBody: clean, trail: quoteLines.join('\n').trim() };
    }
  }

  return { cleanBody: normalized.trim() };
};

export default function App() {
  const [activeTab, setActiveTab] = useState("pending");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [leads, setLeads] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modules state
  const [modules, setModules] = useState<{id: number, name: string}[]>([]);
  const [activeModule, setActiveModule] = useState<string>("Dentist");
  const [isAddingModule, setIsAddingModule] = useState(false);
  const [newModuleName, setNewModuleName] = useState("");
  
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  
  // Export modal state
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFilter, setExportFilter] = useState<'all' | 'pending' | 'outreached' | 'responded'>('all');

  // Gmail state
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState("");
  const [checkingReplies, setCheckingReplies] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Email & Confirmation modals state
  const [isSendConfirmOpen, setIsSendConfirmOpen] = useState(false);
  const [sendTargetLead, setSendTargetLead] = useState<any>(null);
  const [feedbackModal, setFeedbackModal] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'warning';
    title: string;
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);

  // Responded tab red dot notification
  const [hasNewResponses, setHasNewResponses] = useState(false);

  // Conversation thread state
  const [conversation, setConversation] = useState<any[]>([]);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [conversationThreadId, setConversationThreadId] = useState<string | undefined>(undefined);
  const [conversationSubject, setConversationSubject] = useState<string | undefined>(undefined);
  const [lastMessageIdHeader, setLastMessageIdHeader] = useState<string | undefined>(undefined);
  const [expandedTrails, setExpandedTrails] = useState<Record<string, boolean>>({});

  // Settings state
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [emailSignature, setEmailSignature] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [signatureMode, setSignatureMode] = useState<'rich' | 'html'>('rich');

  // Fetch leads and modules on mount
  useEffect(() => {
    fetch('/api/leads')
      .then(res => res.json())
      .then(data => {
        setLeads(data);
        setIsLoading(false);
      })
      .catch(err => {
        console.error("Failed to load leads", err);
        setIsLoading(false);
      });
      
    fetch('/api/modules')
      .then(res => res.json())
      .then(data => {
        setModules(data);
        if (data.length > 0) setActiveModule(data[0].name);
      })
      .catch(console.error);

    fetch('/api/auth/google/status')
      .then(res => res.json())
      .then(data => {
        if (data.connected) {
          setGmailConnected(true);
          setGmailEmail(data.email);
        }
      })
      .catch(console.error);

    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data.signature) {
          setEmailSignature(data.signature);
        }
      })
      .catch(console.error);
  }, []);

  // Check localStorage for unseen responses once leads load
  useEffect(() => {
    if (leads.length === 0) return;
    const currentResponded = leads.filter((l: any) => l.status === 'responded').length;
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('last_seen_responded_count');
      if (stored !== null) {
        if (currentResponded > parseInt(stored, 10)) {
          setHasNewResponses(true);
        }
      } else if (currentResponded > 0) {
        setHasNewResponses(true);
      }
    }
  }, [leads]);

  // Automatic background polling for replies (every 45s)
  useEffect(() => {
    if (!gmailConnected) return;

    const pollRepliesSilently = async () => {
      try {
        const res = await fetch('/api/gmail/receive', { method: 'POST' });
        const data = await res.json();
        if (data.success && data.updatedCount > 0) {
          const leadsRes = await fetch('/api/leads');
          const newLeads = await leadsRes.json();
          setLeads(newLeads);
          setHasNewResponses(true);

          // If current selected lead was one of the replied leads, reload its conversation
          if (selectedLeadId && data.updatedLeadIds?.includes(selectedLeadId)) {
            const currentLead = newLeads.find((l: any) => l.lead_id === selectedLeadId);
            if (currentLead?.contact_info?.email && currentLead.contact_info.email.includes('@')) {
              fetch(`/api/gmail/conversation?email=${encodeURIComponent(currentLead.contact_info.email)}`)
                .then(r => r.json())
                .then(d => {
                  setConversation(d.messages || []);
                  setConversationThreadId(d.threadId);
                  setConversationSubject(d.lastSubject);
                  setLastMessageIdHeader(d.lastMessageIdHeader);
                })
                .catch(console.error);
            }
          }
        }
      } catch (e) {
        // Silent failure in background
      }
    };

    const initialTimer = setTimeout(pollRepliesSilently, 5000);
    const interval = setInterval(pollRepliesSilently, 45000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [gmailConnected, selectedLeadId]);

  const selectedLead = leads.find(l => l.lead_id === selectedLeadId);
  const isConversationActive = selectedLead ? (selectedLead.status === 'responded' || conversation.length > 0) : false;

  // Fetch conversation when selected lead changes
  useEffect(() => {
    if (!selectedLead?.contact_info?.email || !selectedLead.contact_info.email.includes('@') || !gmailConnected) {
      setConversation([]);
      setConversationThreadId(undefined);
      setConversationSubject(undefined);
      setLastMessageIdHeader(undefined);
      return;
    }

    let isMounted = true;
    setLoadingConversation(true);
    setReplyText("");

    fetch(`/api/gmail/conversation?email=${encodeURIComponent(selectedLead.contact_info.email)}`)
      .then(res => res.json())
      .then(data => {
        if (isMounted) {
          setConversation(data.messages || []);
          setConversationThreadId(data.threadId);
          setConversationSubject(data.lastSubject);
          setLastMessageIdHeader(data.lastMessageIdHeader);
          setLoadingConversation(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          console.error("Failed to load conversation", err);
          setLoadingConversation(false);
        }
      });

    return () => { isMounted = false; };
  }, [selectedLead?.lead_id, selectedLead?.contact_info?.email, gmailConnected]);

  const handleAddModule = async () => {
    if (!newModuleName.trim()) return;
    try {
      const res = await fetch('/api/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newModuleName.trim() })
      });
      const data = await res.json();
      setModules([...modules, data]);
      setActiveModule(data.name);
      setNewModuleName("");
      setIsAddingModule(false);
    } catch (err) {
      console.error("Failed to create module", err);
    }
  };

  const changeLeadStatus = async (leadId: string, newStatus: string) => {
    // Auto-advance to next lead if the lead will disappear from current tab view
    if (activeTab !== "all" && activeTab !== newStatus) {
      const currentIdx = filteredLeads.findIndex(l => l.lead_id === leadId);
      if (currentIdx !== -1 && currentIdx + 1 < filteredLeads.length) {
        setSelectedLeadId(filteredLeads[currentIdx + 1].lead_id);
      } else {
        setSelectedLeadId(null);
      }
    }

    // Optimistic update
    setLeads(leads.map(l => l.lead_id === leadId ? { ...l, status: newStatus } : l));
    
    // API call
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  
  const moduleLeads = leads.filter(lead => (lead.module || 'Dentist') === activeModule);
  const pendingCount = moduleLeads.filter(l => l.status === 'pending').length;
  const outreachedCount = moduleLeads.filter(l => l.status === 'outreached').length;
  const respondedCount = moduleLeads.filter(l => l.status === 'responded').length;

  const filteredLeads = moduleLeads.filter(lead => {
    if (activeTab === "pending") return lead.status === "pending";
    if (activeTab === "outreached") return lead.status === "outreached";
    if (activeTab === "responded") return lead.status === "responded";
    return true;
  });

  const getTierClass = (tier: string) => {
    if (tier === "Tier 1") return "b1";
    if (tier === "Tier 2") return "b2";
    return "b3";
  };

  const handleInputChange = (fieldPath: string, value: string) => {
    if (!selectedLead) return;
    
    // Automatically convert em-dash to regular hyphen in draft messages
    if (fieldPath.startsWith('draft_message')) {
      value = value.replace(/—/g, '-');
    }

    const keys = fieldPath.split('.');
    const updatedLead = JSON.parse(JSON.stringify(selectedLead));
    
    if (keys.length === 1) {
      updatedLead[keys[0]] = value;
    } else if (keys.length === 2) {
      updatedLead[keys[0]][keys[1]] = value;
    }

    setLeads(leads.map(l => l.lead_id === updatedLead.lead_id ? updatedLead : l));
  };

  const saveLeadEdits = async () => {
    if (!selectedLead) return;
    setIsEditing(false);
    try {
      await fetch(`/api/leads/${selectedLead.lead_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedLead)
      });
    } catch (err) {
      console.error("Failed to save edits", err);
    }
  };
  const checkGmailReplies = async () => {
    setCheckingReplies(true);
    try {
      const res = await fetch('/api/gmail/receive', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setFeedbackModal({
          isOpen: true,
          type: 'success',
          title: 'Inbox Check Complete',
          message: data.updatedCount > 0 
            ? `Found replies for ${data.updatedCount} lead${data.updatedCount > 1 ? 's' : ''}! Their status has been updated to Responded.`
            : 'Checked inbox. No new replies found at this time.'
        });
        if (data.updatedCount > 0) {
          fetch('/api/leads').then(res => res.json()).then(setLeads);
        }
      } else {
        setFeedbackModal({
          isOpen: true,
          type: 'error',
          title: 'Inbox Check Failed',
          message: data.error || 'Failed to check replies from Gmail.'
        });
      }
    } catch (err) {
      setFeedbackModal({
        isOpen: true,
        type: 'error',
        title: 'Inbox Check Error',
        message: 'An error occurred while checking your Gmail inbox.'
      });
    } finally {
      setCheckingReplies(false);
    }
  };

  const executeSendMail = async (lead: any) => {
    if (!lead) return;
    setSendingEmail(true);
    try {
      const res = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.lead_id,
          to: lead.contact_info?.email,
          cc: lead.draft_message?.cc,
          bcc: lead.draft_message?.bcc,
          subject: (lead.draft_message?.subject || '').replace(/—/g, '-'),
          body: (lead.draft_message?.body || '').replace(/—/g, '-')
        })
      });
      const data = await res.json();
      setIsSendConfirmOpen(false);

      if (data.success) {
        // Auto-advance to next lead if we're not in the "all" tab
        if (activeTab === "pending") {
          const currentIdx = filteredLeads.findIndex(l => l.lead_id === lead.lead_id);
          if (currentIdx !== -1 && currentIdx + 1 < filteredLeads.length) {
            setSelectedLeadId(filteredLeads[currentIdx + 1].lead_id);
          } else {
            setSelectedLeadId(null);
          }
        }
        
        setLeads(leads.map(l => l.lead_id === lead.lead_id ? { ...l, status: 'outreached' } : l));
        setFeedbackModal({
          isOpen: true,
          type: 'success',
          title: 'Email Sent Successfully!',
          message: `Your outreach email to ${lead.contact_info?.email} (${lead.business_name}) was successfully dispatched via Gmail. The lead status has been updated to Outreached.`
        });
      } else {
        setFeedbackModal({
          isOpen: true,
          type: 'error',
          title: 'Failed to Send Email',
          message: data.error || 'There was an issue sending your email. Please verify your Gmail connection and try again.'
        });
      }
    } catch (err) {
      setIsSendConfirmOpen(false);
      setFeedbackModal({
        isOpen: true,
        type: 'error',
        title: 'Network or Server Error',
        message: 'A network error occurred while attempting to send the email. Please check your connection and try again.'
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const handleReviewAndSend = (lead: any) => {
    if (!lead) return;
    if (!gmailConnected) {
      setFeedbackModal({
        isOpen: true,
        type: 'warning',
        title: 'Gmail Not Connected',
        message: 'Please connect your Gmail account in the top bar before sending outreach emails.',
        actionLabel: 'Connect Gmail',
        onAction: () => { window.location.href = '/api/auth/google'; }
      });
      return;
    }

    if (!lead.draft_message?.subject || !lead.draft_message?.body || !lead.contact_info?.email) {
      setFeedbackModal({
        isOpen: true,
        type: 'warning',
        title: 'Missing Required Fields',
        message: 'Please ensure this lead has an email address, subject line, and message body before sending.'
      });
      return;
    }

    setSendTargetLead(lead);
    setIsSendConfirmOpen(true);
  };

  const sendGmail = (lead: any) => {
    handleReviewAndSend(lead);
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedLead?.contact_info?.email) return;
    setSendingReply(true);

    const subject = conversationSubject 
      ? (conversationSubject.toLowerCase().startsWith('re:') ? conversationSubject : `Re: ${conversationSubject}`)
      : (selectedLead.draft_message?.subject || 'Re: Outreach');

    try {
      const res = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: selectedLead.lead_id,
          to: selectedLead.contact_info.email,
          cc: selectedLead.draft_message?.cc,
          bcc: selectedLead.draft_message?.bcc,
          subject,
          body: replyText.trim(),
          threadId: conversationThreadId,
          inReplyTo: lastMessageIdHeader
        })
      });

      const data = await res.json();
      if (data.success) {
        // Optimistically append new message to conversation
        const newMsg = {
          id: data.messageId || String(Date.now()),
          date: 'Just now',
          from: gmailEmail || 'Me',
          to: selectedLead.contact_info.email,
          subject,
          body: replyText.trim(),
          isFromMe: true
        };
        setConversation(prev => [...prev, newMsg]);
        setReplyText("");
      } else {
        setFeedbackModal({
          isOpen: true,
          type: 'error',
          title: 'Failed to Send Reply',
          message: data.error || 'Failed to dispatch reply through Gmail.'
        });
      }
    } catch (err) {
      setFeedbackModal({
        isOpen: true,
        type: 'error',
        title: 'Error Sending Reply',
        message: 'An error occurred while sending your reply.'
      });
    } finally {
      setSendingReply(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  const exportData = (format: 'csv' | 'json') => {
    const leadsToExport = exportFilter === 'all' 
      ? moduleLeads 
      : moduleLeads.filter(l => l.status === exportFilter);

    const flatLeads = leadsToExport.map(lead => ({
      business_name: lead.business_name,
      tier: lead.tier,
      area: lead.area,
      owner_name: lead.owner_details?.name,
      license_credentials: lead.owner_details?.license_credentials,
      graduation_experience: lead.owner_details?.graduation_experience,
      email: lead.contact_info?.email,
      phone_whatsapp: lead.contact_info?.phone_whatsapp,
      website: lead.contact_info?.website,
      address: lead.contact_info?.address,
      facebook: lead.contact_info?.facebook,
      linkedin: lead.contact_info?.linkedin,
      google_maps: lead.contact_info?.google_maps,
      location_note: lead.contact_info?.location_note,
      business_size: lead.business_context?.business_size,
      hours: lead.business_context?.hours,
      founder_age_est: lead.business_context?.founder_age_est,
      opened_since: lead.business_context?.opened_since,
      other_channels_notes: lead.business_context?.other_channels_notes,
      sources: lead.business_context?.sources,
      local_competitors: lead.business_context?.local_competitors,
      snapshot: lead.marketing_angles?.snapshot,
      growth_signals: lead.marketing_angles?.growth_signals,
      automation_angle: lead.marketing_angles?.automation_angle,
      status: lead.status,
      whatsapp_message: lead.draft_message?.whatsapp,
      email_subject: lead.draft_message?.subject,
      email_body: lead.draft_message?.body
    }));
    let content = '';
    let type = '';

    if (format === 'csv') {
      content = Papa.unparse(flatLeads);
      type = 'text/csv;charset=utf-8;';
    } else {
      content = JSON.stringify(flatLeads, null, 2);
      type = 'application/json;charset=utf-8;';
    }

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${activeModule}_leads.${format}`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportModalOpen(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    
    const importLeads = async (data: any[]) => {
      try {
        const res = await fetch('/api/leads/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ module: activeModule, leads: data })
        });
        const resData = await res.json();
        if (resData.success) {
          let msg = `Successfully imported ${resData.imported} leads!`;
          if (resData.duplicates && resData.duplicates.length > 0) {
            msg += `\n\nSkipped ${resData.duplicates.length} duplicate leads:\n${resData.duplicates.slice(0, 10).join(', ')}${resData.duplicates.length > 10 ? '...' : ''}`;
          }
          alert(msg);
          window.location.reload();
        } else {
          alert('Import failed.');
        }
      } catch (err) {
        alert('Error during import');
      } finally {
        setImporting(false);
        setIsImportModalOpen(false);
      }
    };

    if (file.name.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = JSON.parse(event.target?.result as string);
          importLeads(Array.isArray(json) ? json : [json]);
        } catch (err) {
          alert("Invalid JSON file");
          setImporting(false);
        }
      };
      reader.readAsText(file);
    } else {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => importLeads(results.data)
      });
    }
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header" style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
          <h1>Zeon Outreach Hub</h1>
          <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
            {isAddingModule ? (
              <div style={{display: 'flex', flex: 1, gap: '4px'}}>
                <input 
                  autoFocus
                  style={{flex: 1, padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--line)'}} 
                  value={newModuleName} 
                  onChange={e => setNewModuleName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddModule()}
                  placeholder="Module name"
                />
                <button className="btn primary" style={{padding: '4px 8px'}} onClick={handleAddModule}>Add</button>
                <button className="btn" style={{padding: '4px 8px'}} onClick={() => setIsAddingModule(false)}>X</button>
              </div>
            ) : (
              <>
                <select 
                  style={{flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid var(--line)', background: 'var(--bg)', fontWeight: '600'}}
                  value={activeModule}
                  onChange={(e) => { setActiveModule(e.target.value); setSelectedLeadId(null); }}
                >
                  {modules.map(m => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                </select>
                <button className="btn" style={{padding: '4px 10px', fontWeight: 'bold'}} onClick={() => setIsAddingModule(true)} title="Add New Module">+</button>
              </>
            )}
          </div>
        </div>
        
        <div className="tabs-container">
          <button 
            className={`tab-btn ${activeTab === "pending" ? "active" : ""}`}
            onClick={() => { setActiveTab("pending"); setSelectedLeadId(null); setIsEditing(false); }}
          >
            Pending ({pendingCount})
          </button>
          <button 
            className={`tab-btn ${activeTab === "outreached" ? "active" : ""}`}
            onClick={() => { setActiveTab("outreached"); setSelectedLeadId(null); setIsEditing(false); }}
          >
            Outreached ({outreachedCount})
          </button>
          <button 
            className={`tab-btn ${activeTab === "responded" ? "active" : ""}`}
            style={{ position: 'relative' }}
            onClick={() => { 
              setActiveTab("responded"); 
              setSelectedLeadId(null); 
              setIsEditing(false); 
              setHasNewResponses(false);
              if (typeof window !== 'undefined') {
                localStorage.setItem('last_seen_responded_count', String(respondedCount));
              }
            }}
          >
            Responded ({respondedCount})
            {hasNewResponses && (
              <span 
                style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#ef4444',
                  marginLeft: '6px',
                  verticalAlign: 'middle',
                  boxShadow: '0 0 0 2px #fff, 0 0 6px #ef4444',
                  animation: 'pulse 1.5s infinite'
                }} 
                title="New response received!"
              />
            )}
          </button>
        </div>

        <div className="lead-list">
          {isLoading && (
            <div style={{textAlign: 'center', padding: '20px', color: 'var(--muted)', fontSize: '13px'}}>
               Loading leads from Neon...
            </div>
          )}
          {!isLoading && filteredLeads.map((lead) => (
            <div 
              key={lead.lead_id} 
              className={`lead-card ${selectedLead?.lead_id === lead.lead_id ? "selected" : ""}`}
              onClick={() => { setSelectedLeadId(lead.lead_id); setIsEditing(false); }}
            >
              <h3>{lead.business_name}</h3>
              <p>
                <span className={`badge ${getTierClass(lead.tier)}`}>{lead.tier}</span>
                {lead.area}
              </p>
            </div>
          ))}
          {!isLoading && filteredLeads.length === 0 && (
             <div style={{textAlign: 'center', padding: '20px', color: 'var(--muted)', fontSize: '13px'}}>
               No leads in this view.
             </div>
          )}
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', borderBottom: '1px solid var(--line)' }}>
          <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
            {gmailConnected ? (
              <>
                <div style={{fontSize: '13px', color: 'var(--brand)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px'}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                  {gmailEmail}
                </div>
                <button className="btn" style={{padding: '4px 8px', fontSize: '12px'}} onClick={checkGmailReplies} disabled={checkingReplies}>
                  {checkingReplies ? 'Checking...' : 'Check Replies'}
                </button>
              </>
            ) : (
              <a href="/api/auth/google" className="btn primary" style={{padding: '6px 12px', fontSize: '12px', fontWeight: 600}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                Connect Gmail
              </a>
            )}
          </div>
          <div style={{display: 'flex', gap: '8px'}}>
            <button className="btn" style={{padding: '6px 12px', fontSize: '12px', fontWeight: 600}} onClick={() => setIsImportModalOpen(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Import Data
            </button>
            <button className="btn" style={{padding: '6px 12px', fontSize: '12px', fontWeight: 600}} onClick={() => setIsExportModalOpen(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              Export Data
            </button>
            <button className="btn" style={{padding: '6px 12px', fontSize: '12px', fontWeight: 600}} onClick={() => setIsSettingsModalOpen(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              Settings
            </button>
          </div>
        </header>

        {selectedLead ? (
          <div className="detail-view">
            <div className="detail-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
              <div>
                {isEditing ? (
                  <input 
                    style={{fontSize: '22px', fontWeight: 'bold', background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', marginBottom: '6px', width: '100%'}}
                    value={selectedLead.business_name}
                    onChange={(e) => handleInputChange('business_name', e.target.value)}
                  />
                ) : (
                  <h2>{selectedLead.business_name}</h2>
                )}
                <div className="detail-meta">
                  {isEditing ? (
                    <input style={{marginRight: '10px'}} value={selectedLead.area} onChange={(e) => handleInputChange('area', e.target.value)} />
                  ) : (
                    <span>📍 {selectedLead.area}</span>
                  )}
                  {isEditing ? (
                    <input style={{marginRight: '10px'}} value={selectedLead.owner_details.name} onChange={(e) => handleInputChange('owner_details.name', e.target.value)} />
                  ) : (
                    <span>👤 {selectedLead.owner_details.name}</span>
                  )}
                  <span><span className={`badge ${getTierClass(selectedLead.tier)}`}>{selectedLead.tier}</span></span>
                </div>
              </div>
              <button 
                className="btn" 
                style={{background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none'}}
                onClick={() => isEditing ? saveLeadEdits() : setIsEditing(true)}
              >
                {isEditing ? 'Save Details' : 'Edit Details'}
              </button>
            </div>

            <div className="detail-body">
              <div className="sec">
                <h3>Contact Info</h3>
                <div className="grid">
                  <div className="kv">
                    <div className="k">Address & Location</div>
                    {isEditing ? <input style={{width:'100%'}} value={selectedLead.contact_info.address} onChange={e => handleInputChange('contact_info.address', e.target.value)} /> : (
                      <ul className="comp-list" style={{marginTop:0}}>
                        <li>{selectedLead.contact_info.address}</li>
                        {selectedLead.contact_info.location_note && <li>{selectedLead.contact_info.location_note}</li>}
                        {getFirstUrl(selectedLead.contact_info.google_maps) && (
                          <li><a href={getFirstUrl(selectedLead.contact_info.google_maps)} target="_blank" rel="noreferrer" style={{color:'var(--brand)', textDecoration:'underline'}}>📍 Open in Google Maps</a></li>
                        )}
                      </ul>
                    )}
                  </div>
                  <div className="kv">
                    <div className="k">Email & Phone</div>
                    <ul className="comp-list" style={{marginTop:0, display: 'flex', flexDirection: 'column', gap: '8px'}}>
                      <li style={{display:'flex', alignItems:'center', gap: '6px'}}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                        <a href={`mailto:${selectedLead.contact_info.email}`} style={{color:'var(--brand)', textDecoration:'underline'}}>{selectedLead.contact_info.email || 'N/A'}</a>
                        {selectedLead.contact_info.email && <span onClick={() => copyToClipboard(selectedLead.contact_info.email)} title="Copy Email"><CopyIcon /></span>}
                      </li>
                      {selectedLead.contact_info.alt_email && (
                        <li style={{display:'flex', alignItems:'center', gap: '6px'}}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                          <span>{selectedLead.contact_info.alt_email}</span>
                        </li>
                      )}
                      
                      <li style={{display:'flex', alignItems:'center', gap: '6px', flexWrap: 'wrap'}}>
                        {extractPhone(selectedLead.contact_info.phone_whatsapp) ? (
                          <>
                            <div style={{display:'flex', alignItems:'center', gap: '6px'}}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                              <a href={`tel:${cleanPhone(extractPhone(selectedLead.contact_info.phone_whatsapp))}`} style={{color:'var(--brand)', textDecoration:'underline'}}>{extractPhone(selectedLead.contact_info.phone_whatsapp)}</a>
                            </div>
                            <div style={{display:'flex', alignItems:'center', gap: '6px', marginLeft: '12px'}}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                              <a href={`https://wa.me/${cleanPhone(extractPhone(selectedLead.contact_info.phone_whatsapp))}`} target="_blank" rel="noreferrer" style={{color:'inherit', textDecoration:'none', fontWeight:500}}>WhatsApp</a>
                            </div>
                          </>
                        ) : (
                          <div style={{display:'flex', alignItems:'center', gap: '6px'}}>
                             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                             <span>{selectedLead.contact_info.phone_whatsapp || 'N/A'}</span>
                          </div>
                        )}
                      </li>
                    </ul>
                  </div>
                  <div className="kv">
                    <div className="k">Website & Social Media</div>
                    <div className="v" style={{display:'flex', gap:'16px', alignItems:'center', marginTop:'8px'}}>
                      {selectedLead.contact_info.website ? (
                        <a href={selectedLead.contact_info.website} target="_blank" rel="noreferrer" title="Website" style={{color: 'var(--fg)', textDecoration: 'none'}}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                        </a>
                      ) : <span style={{color:'var(--muted)', fontSize:'12px'}}>No Web</span>}
                      {getFirstUrl(selectedLead.contact_info.facebook) ? (
                        <a href={getFirstUrl(selectedLead.contact_info.facebook)} target="_blank" rel="noreferrer" title="Facebook">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                        </a>
                      ) : <span style={{color:'var(--muted)', fontSize:'12px'}}>No FB</span>}
                      {getFirstUrl(selectedLead.contact_info.linkedin) ? (
                        <a href={getFirstUrl(selectedLead.contact_info.linkedin)} target="_blank" rel="noreferrer" title="LinkedIn">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                        </a>
                      ) : <span style={{color:'var(--muted)', fontSize:'12px'}}>No IN</span>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="sec">
                <h3>Business Context & Profile</h3>
                <div className="grid">
                  <div className="kv">
                    <div className="k">Scale & Hours</div>
                    <ul className="comp-list" style={{marginTop:0}}>
                      <li><strong>Scale:</strong> {selectedLead.business_context.business_size}</li>
                      <li><strong>Hours:</strong> {selectedLead.business_context.hours}</li>
                    </ul>
                  </div>
                  <div className="kv">
                    <div className="k">Credentials</div>
                    <ul className="comp-list" style={{marginTop:0}}>
                      <li>{selectedLead.owner_details.license_credentials}</li>
                      <li>{selectedLead.owner_details.graduation_experience}</li>
                    </ul>
                  </div>
                  <div className="kv">
                    <div className="k">Age & Opening</div>
                    <ul className="comp-list" style={{marginTop:0}}>
                      <li><strong>Opened:</strong> {selectedLead.business_context.opened_since}</li>
                      <li><strong>Founder Est:</strong> {selectedLead.business_context.founder_age_est} {selectedLead.business_context.age_flag}</li>
                    </ul>
                  </div>
                  <div className="kv" style={{gridColumn: '1 / -1'}}>
                    <div className="k">Competitors & Notes</div>
                    <div className="v" style={{fontSize: '13px', lineHeight: '1.6'}}>
                      <strong style={{color:'var(--brand)'}}>Competitors:</strong>
                      {selectedLead.business_context.local_competitors ? (
                        <ul className="comp-list">
                          {selectedLead.business_context.local_competitors.split('|').map((comp: string, i: number) => (
                            <li key={i}>{comp.trim()}</li>
                          ))}
                        </ul>
                      ) : (
                        <div style={{marginBottom:'8px'}}>None listed</div>
                      )}
                      
                      <strong style={{color:'var(--brand)'}}>Sources:</strong> <span style={{color:'var(--muted)'}}>{selectedLead.business_context.sources || 'N/A'}</span><br/>
                      <div style={{marginTop: '8px'}}>
                        <strong style={{color:'var(--brand)'}}>Notes:</strong>
                        <div className="note-box">
                           {selectedLead.business_context.other_channels_notes || 'No additional notes.'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="sec">
                <h3>Marketing Angle</h3>
                <div className="flag warn">
                  <strong>Snapshot:</strong> {isEditing ? <input style={{width:'100%', marginBottom: '4px'}} value={selectedLead.marketing_angles.snapshot} onChange={e => handleInputChange('marketing_angles.snapshot', e.target.value)} /> : selectedLead.marketing_angles.snapshot}<br/>
                  <strong>Angle:</strong> {isEditing ? <input style={{width:'100%'}} value={selectedLead.marketing_angles.automation_angle} onChange={e => handleInputChange('marketing_angles.automation_angle', e.target.value)} /> : selectedLead.marketing_angles.automation_angle}
                </div>
              </div>

              <div className="sec">
                <h3>WhatsApp Outreach</h3>
                <div className="mail">
                  <div className="bar">
                    <button className="btn" onClick={() => copyToClipboard((selectedLead.draft_message?.whatsapp || '').replace(/—/g, '-'))}>Copy Message</button>
                    <a className="btn primary" href={`https://wa.me/${selectedLead.contact_info?.phone_whatsapp?.replace(/[^0-9]/g, '')}?text=${encodeURIComponent((selectedLead.draft_message?.whatsapp || '').replace(/—/g, '-'))}`} target="_blank" rel="noreferrer">Open WhatsApp</a>
                  </div>
                  <textarea 
                    style={{minHeight: '220px'}}
                    value={(selectedLead.draft_message?.whatsapp || '').replace(/—/g, '-')}
                    onChange={(e) => handleInputChange('draft_message.whatsapp', e.target.value)}
                  />
                </div>
              </div>

              {/* Personalized outreach email is only needed before conversation starts */}
              {!isConversationActive && (
                <div className="sec">
                  <h3>Email Outreach</h3>
                  <div className="mail">
                    <div className="bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: '200px', gap: '4px' }}>
                        <div className="to" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <strong>To:</strong> 
                          <input 
                            type="email" 
                            value={selectedLead.contact_info?.email || ''} 
                            onChange={(e) => handleInputChange('contact_info.email', e.target.value)} 
                            style={{ border: '1px solid transparent', background: 'transparent', outline: 'none', flex: 1, fontSize: '13px', padding: '2px 6px', borderRadius: '4px', transition: 'all 0.2s' }} 
                            onFocus={(e) => { e.target.style.border = '1px solid var(--line)'; e.target.style.background = '#fff'; }}
                            onBlur={(e) => { e.target.style.border = '1px solid transparent'; e.target.style.background = 'transparent'; }}
                            placeholder="No email provided"
                          />
                        </div>
                        <div className="to" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <strong>Cc:</strong> 
                          <input 
                            type="text" 
                            value={selectedLead.draft_message?.cc || ''} 
                            onChange={(e) => handleInputChange('draft_message.cc', e.target.value)} 
                            style={{ border: '1px solid transparent', background: 'transparent', outline: 'none', flex: 1, fontSize: '13px', padding: '2px 6px', borderRadius: '4px', transition: 'all 0.2s' }} 
                            onFocus={(e) => { e.target.style.border = '1px solid var(--line)'; e.target.style.background = '#fff'; }}
                            onBlur={(e) => { e.target.style.border = '1px solid transparent'; e.target.style.background = 'transparent'; }}
                            placeholder="Optional CC (comma-separated)"
                          />
                        </div>
                        <div className="to" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <strong>Bcc:</strong> 
                          <input 
                            type="text" 
                            value={selectedLead.draft_message?.bcc || ''} 
                            onChange={(e) => handleInputChange('draft_message.bcc', e.target.value)} 
                            style={{ border: '1px solid transparent', background: 'transparent', outline: 'none', flex: 1, fontSize: '13px', padding: '2px 6px', borderRadius: '4px', transition: 'all 0.2s' }} 
                            onFocus={(e) => { e.target.style.border = '1px solid var(--line)'; e.target.style.background = '#fff'; }}
                            onBlur={(e) => { e.target.style.border = '1px solid transparent'; e.target.style.background = 'transparent'; }}
                            placeholder="Optional BCC (comma-separated)"
                          />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn" onClick={() => copyToClipboard((selectedLead.draft_message?.body || '').replace(/—/g, '-'))}>Copy Body</button>
                        <button 
                          className="btn primary" 
                          onClick={() => handleReviewAndSend(selectedLead)} 
                          disabled={sendingEmail}
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                        >
                          {sendingEmail ? 'Sending...' : 'Send via Gmail'}
                        </button>
                      </div>
                    </div>
                    <div className="subj">
                      <span className="lbl">Subject:</span>
                      <input 
                        type="text" 
                        value={(selectedLead.draft_message?.subject || '').replace(/—/g, '-')} 
                        onChange={(e) => handleInputChange('draft_message.subject', e.target.value)}
                      />
                    </div>
                    <ReactQuill 
                      theme="snow"
                      value={formatForQuill(selectedLead.draft_message?.body)} 
                      onChange={(content) => handleInputChange('draft_message.body', content)}
                      style={{background: '#fff', border: 'none', borderRadius: '0 0 8px 8px'}}
                    />
                  </div>
                </div>
              )}

              {/* Conversation History & Interactive Reply Section - at the bottom of the page */}
              <div className="sec">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>💬 Conversation History</span>
                    {conversation.length > 0 && (
                      <span style={{ fontSize: '11px', background: 'var(--accent-soft)', color: 'var(--accent)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                        {conversation.length} message{conversation.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </h3>
                  {gmailConnected && selectedLead.contact_info?.email?.includes('@') && (
                    <button 
                      className="btn" 
                      style={{ padding: '4px 8px', fontSize: '11px' }}
                      disabled={loadingConversation}
                      onClick={() => {
                        setLoadingConversation(true);
                        fetch(`/api/gmail/conversation?email=${encodeURIComponent(selectedLead.contact_info.email)}`)
                          .then(r => r.json())
                          .then(d => {
                            setConversation(d.messages || []);
                            setConversationThreadId(d.threadId);
                            setConversationSubject(d.lastSubject);
                            setLastMessageIdHeader(d.lastMessageIdHeader);
                            setLoadingConversation(false);
                          })
                          .catch(() => setLoadingConversation(false));
                      }}
                      title="Refresh Gmail messages"
                    >
                      {loadingConversation ? 'Loading...' : '↻ Refresh'}
                    </button>
                  )}
                </div>

                {!gmailConnected ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--line)' }}>
                    Connect your Gmail account in the top bar to view and continue email conversations.
                  </div>
                ) : loadingConversation ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--line)' }}>
                    Checking Gmail for conversation history...
                  </div>
                ) : conversation.length === 0 ? (
                  <div style={{ padding: '18px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--line)' }}>
                    No prior email messages found in Gmail for <strong>{selectedLead.contact_info?.email || 'this lead'}</strong>.
                    <div style={{ marginTop: '6px', fontSize: '12px' }}>Send your initial outreach email above to start the conversation!</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '420px', overflowY: 'auto', padding: '14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--line)' }}>
                    {conversation.map((msg, i) => {
                      const msgKey = msg.id || String(i);
                      const { cleanBody, trail: fallbackTrail } = stripMessageTrail(msg.body || '');
                      const trail = msg.trail || fallbackTrail;
                      const isExpanded = !!expandedTrails[msgKey];

                      return (
                        <div 
                          key={msgKey}
                          style={{
                            alignSelf: msg.isFromMe ? 'flex-end' : 'flex-start',
                            maxWidth: '85%',
                            background: msg.isFromMe ? 'var(--accent-soft)' : '#fff',
                            border: msg.isFromMe ? '1px solid rgba(15, 118, 110, 0.25)' : '1px solid var(--line)',
                            borderRadius: msg.isFromMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                            padding: '12px 14px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' }}>
                            <span style={{ fontWeight: 700, color: msg.isFromMe ? 'var(--accent)' : 'var(--ink)' }}>
                              {msg.isFromMe ? 'You (Sent)' : `${selectedLead.owner_details?.name || selectedLead.business_name} (Reply)`}
                            </span>
                            <span style={{ fontSize: '10.5px' }}>{msg.date}</span>
                          </div>
                          {msg.subject && (
                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)', marginBottom: '4px' }}>
                              {msg.subject}
                            </div>
                          )}
                          <div style={{ fontSize: '13px', lineHeight: '1.5', whiteSpace: 'pre-wrap', color: 'var(--ink)' }}>
                            {cleanBody}
                          </div>
                          {trail && (
                            <div style={{ marginTop: '8px', borderTop: '1px dashed var(--line)', paddingTop: '6px' }}>
                              <button
                                onClick={() => setExpandedTrails(prev => ({ ...prev, [msgKey]: !prev[msgKey] }))}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--muted)',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  padding: '2px 4px',
                                  borderRadius: '4px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                title="Toggle previous message trail"
                              >
                                {isExpanded ? '▲ Hide quoted trail' : '··· Show quoted trail'}
                              </button>
                              {isExpanded && (
                                <div style={{
                                  marginTop: '6px',
                                  padding: '8px 10px',
                                  background: 'rgba(0,0,0,0.03)',
                                  borderLeft: '2px solid var(--muted)',
                                  fontSize: '11.5px',
                                  color: 'var(--muted)',
                                  whiteSpace: 'pre-wrap',
                                  maxHeight: '180px',
                                  overflowY: 'auto'
                                }}>
                                  {trail}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Continue Conversation Composer */}
                {gmailConnected && selectedLead.contact_info?.email && (
                  <div style={{ marginTop: '16px', borderTop: '1px solid var(--line)', paddingTop: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                        Continue Conversation
                      </h4>
                      {conversationSubject && (
                        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                          Subject: {conversationSubject.startsWith('Re:') ? conversationSubject : `Re: ${conversationSubject}`}
                        </span>
                      )}
                    </div>
                    <div className="to" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '13px' }}>
                      <strong>Cc:</strong> 
                      <input 
                        type="text" 
                        value={selectedLead.draft_message?.cc || ''} 
                        onChange={(e) => handleInputChange('draft_message.cc', e.target.value)} 
                        style={{ border: '1px solid transparent', background: 'transparent', outline: 'none', flex: 1, fontSize: '13px', padding: '2px 6px', borderRadius: '4px', transition: 'all 0.2s' }} 
                        onFocus={(e) => { e.target.style.border = '1px solid var(--line)'; e.target.style.background = '#fff'; }}
                        onBlur={(e) => { e.target.style.border = '1px solid transparent'; e.target.style.background = 'transparent'; }}
                        placeholder="Optional CC (comma-separated)"
                      />
                    </div>
                    <div className="to" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '13px' }}>
                      <strong>Bcc:</strong> 
                      <input 
                        type="text" 
                        value={selectedLead.draft_message?.bcc || ''} 
                        onChange={(e) => handleInputChange('draft_message.bcc', e.target.value)} 
                        style={{ border: '1px solid transparent', background: 'transparent', outline: 'none', flex: 1, fontSize: '13px', padding: '2px 6px', borderRadius: '4px', transition: 'all 0.2s' }} 
                        onFocus={(e) => { e.target.style.border = '1px solid var(--line)'; e.target.style.background = '#fff'; }}
                        onBlur={(e) => { e.target.style.border = '1px solid transparent'; e.target.style.background = 'transparent'; }}
                        placeholder="Optional BCC (comma-separated)"
                      />
                    </div>
                    <div style={{ background: '#fff', borderRadius: '6px', border: '1px solid var(--line)', overflow: 'hidden' }}>
                      <ReactQuill 
                        theme="snow"
                        value={replyText} 
                        onChange={setReplyText}
                        placeholder={`Write a reply to ${selectedLead.contact_info?.email}...`}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                      <button
                        className="btn primary"
                        onClick={handleSendReply}
                        disabled={sendingReply || !replyText.trim()}
                        style={{ padding: '6px 16px', fontSize: '13px' }}
                      >
                        {sendingReply ? 'Sending Reply...' : 'Send Reply'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="actions-row" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {isEditing ? (
                <>
                  <button className="btn primary" onClick={saveLeadEdits}>Save Changes</button>
                  <button className="btn" onClick={() => setIsEditing(false)}>Cancel</button>
                </>
              ) : (
                <>
                  <button className="btn" onClick={() => setIsEditing(true)}>Edit Details</button>
                  <div style={{flex: 1}}></div>
                  {!isConversationActive && selectedLead && (
                    <button 
                      className="btn primary" 
                      onClick={() => handleReviewAndSend(selectedLead)}
                      disabled={sendingEmail}
                    >
                      {sendingEmail ? 'Sending...' : 'Review & send with Gmail'}
                    </button>
                  )}
                  {selectedLead.status === 'pending' && (
                    <button className="btn primary" style={{background: '#10b981', color: '#fff', borderColor: '#10b981'}} onClick={() => changeLeadStatus(selectedLead.lead_id, 'outreached')}>
                      ✓ Mark as Outreached
                    </button>
                  )}
                  {(selectedLead.status === 'outreached' || selectedLead.status === 'responded') && (
                    <button className="btn" style={{color: 'var(--muted)'}} onClick={() => changeLeadStatus(selectedLead.lead_id, 'pending')}>
                      ↩ Revert to Pending
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{marginBottom: '16px', opacity: 0.5}}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
            <h2>Select a Lead</h2>
            <p style={{marginTop: 0}}>Choose a lead from the sidebar to review and send.</p>
          </div>
        )}
      </main>

      {isImportModalOpen && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000}}>
          <div style={{background: '#fff', padding: '24px', borderRadius: '12px', width: '400px', maxWidth: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.1)'}}>
            <h2 style={{marginTop: 0, fontSize: '18px'}}>Import Leads</h2>
            <p style={{fontSize: '14px', color: 'var(--muted)', lineHeight: '1.5'}}>
              Upload a CSV or JSON file to import leads into the <strong>{activeModule}</strong> module.
            </p>
            <div style={{margin: '16px 0', display: 'flex', gap: '16px'}}>
               <a href="/example_template.csv" download style={{color: 'var(--brand)', fontSize: '13px', textDecoration: 'underline'}}>Template (CSV)</a>
               <a href="/example_template.json" download style={{color: 'var(--brand)', fontSize: '13px', textDecoration: 'underline'}}>Template (JSON)</a>
            </div>
            <input type="file" accept=".csv,.json" onChange={handleFileUpload} disabled={importing} style={{display: 'block', width: '100%', padding: '12px', border: '1px dashed var(--line)', borderRadius: '6px', background: '#f8fafc', cursor: 'pointer'}} />
            {importing && <p style={{fontSize: '13px', color: 'var(--brand)', marginTop: '12px', fontWeight: 600}}>Importing leads... Please wait.</p>}
            <div style={{marginTop: '24px', display: 'flex', justifyContent: 'flex-end'}}>
              <button className="btn" onClick={() => setIsImportModalOpen(false)} disabled={importing}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {isSettingsModalOpen && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000}}>
          <div style={{background: '#fff', padding: '24px', borderRadius: '12px', width: '600px', maxWidth: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.1)'}}>
            <h2 style={{marginTop: 0, fontSize: '18px'}}>Settings</h2>
            
            <div style={{marginBottom: '20px'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                <label style={{fontSize: '13px', fontWeight: 600, color: 'var(--ink)'}}>Email Signature</label>
                <div style={{display: 'flex', gap: '8px', background: '#f1f5f9', padding: '4px', borderRadius: '6px'}}>
                  <button 
                    style={{
                      border: 'none', background: signatureMode === 'rich' ? '#fff' : 'transparent', 
                      boxShadow: signatureMode === 'rich' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                      padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                      color: signatureMode === 'rich' ? 'var(--ink)' : 'var(--muted)'
                    }}
                    onClick={() => setSignatureMode('rich')}
                  >
                    Rich Text
                  </button>
                  <button 
                    style={{
                      border: 'none', background: signatureMode === 'html' ? '#fff' : 'transparent', 
                      boxShadow: signatureMode === 'html' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                      padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                      color: signatureMode === 'html' ? 'var(--ink)' : 'var(--muted)'
                    }}
                    onClick={() => setSignatureMode('html')}
                  >
                    HTML Code
                  </button>
                </div>
              </div>
              <p style={{fontSize: '12px', color: 'var(--muted)', marginBottom: '12px'}}>
                This signature will be appended to all new outreach emails and replies.
              </p>
              
              {signatureMode === 'rich' ? (
                <div style={{ background: '#fff', borderRadius: '6px', border: '1px solid var(--line)', overflow: 'hidden' }}>
                  <style>{`.settings-quill .ql-editor { min-height: 200px; max-height: 400px; overflow-y: auto; }`}</style>
                  <ReactQuill 
                    className="settings-quill"
                    theme="snow"
                    value={emailSignature} 
                    onChange={setEmailSignature}
                    placeholder="Write your email signature here..."
                  />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <textarea
                    style={{ width: '100%', minHeight: '200px', maxHeight: '400px', padding: '12px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '13px', fontFamily: 'monospace', resize: 'vertical', background: '#f8fafc', color: 'var(--ink)' }}
                    placeholder="<p>Write your raw HTML signature here...</p>"
                    value={emailSignature}
                    onChange={(e) => setEmailSignature(e.target.value)}
                  />
                  <div>
                    <div style={{fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Live Preview</div>
                    <div 
                      style={{ padding: '16px', borderRadius: '6px', border: '1px solid var(--line)', background: '#fff', minHeight: '100px' }}
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize((emailSignature || '<span style="color: var(--muted); font-style: italic;">No signature content</span>').replace(/<p>/gi, '<p style="margin: 0; padding: 0; line-height: 1.2;">')) }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div style={{marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '8px'}}>
              <button className="btn" onClick={() => setIsSettingsModalOpen(false)} disabled={savingSettings}>Cancel</button>
              <button 
                className="btn primary" 
                disabled={savingSettings}
                onClick={async () => {
                  setSavingSettings(true);
                  try {
                    await fetch('/api/settings', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ signature: emailSignature })
                    });
                    setIsSettingsModalOpen(false);
                  } catch (e) {
                    console.error('Failed to save settings', e);
                  } finally {
                    setSavingSettings(false);
                  }
                }}
              >
                {savingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isExportModalOpen && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000}}>
          <div style={{background: '#fff', padding: '24px', borderRadius: '12px', width: '400px', maxWidth: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.1)'}}>
            <h2 style={{marginTop: 0, fontSize: '18px'}}>Export Leads</h2>
            <p style={{fontSize: '14px', color: 'var(--muted)', lineHeight: '1.5', marginBottom: '16px'}}>
              Download leads from the <strong>{activeModule}</strong> module.
            </p>
            <div style={{marginBottom: '20px'}}>
              <label style={{display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginBottom: '8px'}}>Filter by Status:</label>
              <select 
                style={{width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--line)', background: '#f8fafc', fontSize: '14px'}}
                value={exportFilter}
                onChange={(e) => setExportFilter(e.target.value as any)}
              >
                <option value="all">All ({moduleLeads.length})</option>
                <option value="pending">Pending ({pendingCount})</option>
                <option value="outreached">Outreached ({outreachedCount})</option>
                <option value="responded">Responded ({respondedCount})</option>
              </select>
            </div>
            <div style={{display: 'flex', flexDirection: 'column', gap: '8px', margin: '20px 0'}}>
              <button className="btn" style={{justifyContent: 'center', padding: '12px', fontWeight: 600}} onClick={() => exportData('csv')}>
                Download CSV (.csv)
              </button>
              <button className="btn" style={{justifyContent: 'center', padding: '12px', fontWeight: 600}} onClick={() => exportData('json')}>
                Download JSON (.json)
              </button>
            </div>
            <div style={{display: 'flex', justifyContent: 'flex-end'}}>
              <button className="btn" onClick={() => setIsExportModalOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {isSendConfirmOpen && sendTargetLead && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000}}>
          <div style={{background: '#fff', padding: '24px', borderRadius: '12px', width: '650px', maxWidth: '92%', boxShadow: '0 10px 25px rgba(0,0,0,0.1)'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px'}}>
              <div style={{width: '38px', height: '38px', borderRadius: '10px', background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)'}}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
              </div>
              <div>
                <h2 style={{margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--ink)'}}>Send Outreach Email</h2>
                <div style={{fontSize: '12px', color: 'var(--muted)', marginTop: '2px'}}>From: {gmailEmail || 'Connected Gmail account'}</div>
              </div>
            </div>

            <p style={{fontSize: '14px', color: 'var(--muted)', lineHeight: '1.5', margin: '0 0 16px 0'}}>
              Are you sure you want to send this email to <strong>{sendTargetLead.business_name}</strong>?
            </p>

            <div style={{background: '#f8fafc', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px 14px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '8px'}}>
              <div style={{fontSize: '13px', display: 'flex', gap: '6px'}}>
                <span style={{color: 'var(--muted)', minWidth: '55px'}}>To:</span>
                <span style={{color: 'var(--ink)', fontWeight: 600}}>{sendTargetLead.contact_info?.email}</span>
              </div>
              {sendTargetLead.draft_message?.cc && (
                <div style={{fontSize: '13px', display: 'flex', gap: '6px'}}>
                  <span style={{color: 'var(--muted)', minWidth: '55px'}}>Cc:</span>
                  <span style={{color: 'var(--ink)', fontWeight: 600}}>{sendTargetLead.draft_message.cc}</span>
                </div>
              )}
              {sendTargetLead.draft_message?.bcc && (
                <div style={{fontSize: '13px', display: 'flex', gap: '6px'}}>
                  <span style={{color: 'var(--muted)', minWidth: '55px'}}>Bcc:</span>
                  <span style={{color: 'var(--ink)', fontWeight: 600}}>{sendTargetLead.draft_message.bcc}</span>
                </div>
              )}
              <div style={{fontSize: '13px', display: 'flex', gap: '6px'}}>
                <span style={{color: 'var(--muted)', minWidth: '55px'}}>Subject:</span>
                <span style={{color: 'var(--ink)', fontWeight: 600}}>{sendTargetLead.draft_message?.subject}</span>
              </div>
              <div 
                style={{fontSize: '13px', color: 'var(--muted)', marginTop: '4px', borderTop: '1px dashed var(--line)', paddingTop: '12px', maxHeight: '350px', overflowY: 'auto', lineHeight: '1.6'}}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize((sendTargetLead.draft_message?.body || '') + (emailSignature ? `<div style="margin-top: 16px; margin-bottom: 8px;">Best regards,</div><div>${emailSignature.replace(/<p>/gi, '<p style="margin: 0; padding: 0; line-height: 1.2;">')}</div>` : '')) }}
              />
            </div>

            <div style={{display: 'flex', justifyContent: 'flex-end', gap: '10px'}}>
              <button className="btn" onClick={() => setIsSendConfirmOpen(false)} disabled={sendingEmail}>
                Cancel
              </button>
              <button 
                className="btn primary" 
                onClick={() => executeSendMail(sendTargetLead)} 
                disabled={sendingEmail}
                style={{minWidth: '120px', justifyContent: 'center'}}
              >
                {sendingEmail ? 'Sending...' : 'Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}

      {feedbackModal && feedbackModal.isOpen && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000}}>
          <div style={{background: '#fff', padding: '24px', borderRadius: '12px', width: '420px', maxWidth: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', textAlign: 'center'}}>
            <div style={{
              width: '48px', 
              height: '48px', 
              borderRadius: '50%', 
              background: feedbackModal.type === 'success' ? '#dcfce7' : feedbackModal.type === 'error' ? '#fee2e2' : '#fef3c7', 
              color: feedbackModal.type === 'success' ? '#15803d' : feedbackModal.type === 'error' ? '#b91c1c' : '#b45309', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              margin: '0 auto 16px auto'
            }}>
              {feedbackModal.type === 'success' ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              ) : feedbackModal.type === 'error' ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              )}
            </div>

            <h2 style={{margin: '0 0 8px 0', fontSize: '18px', fontWeight: 700, color: 'var(--ink)'}}>{feedbackModal.title}</h2>
            <p style={{fontSize: '14px', color: 'var(--muted)', lineHeight: '1.5', margin: '0 0 24px 0'}}>
              {feedbackModal.message}
            </p>

            <div style={{display: 'flex', justifyContent: 'center', gap: '8px'}}>
              {feedbackModal.actionLabel && feedbackModal.onAction ? (
                <>
                  <button className="btn" onClick={() => setFeedbackModal(null)}>Cancel</button>
                  <button className="btn primary" onClick={() => { feedbackModal.onAction?.(); setFeedbackModal(null); }}>
                    {feedbackModal.actionLabel}
                  </button>
                </>
              ) : (
                <button className="btn primary" style={{minWidth: '100px', justifyContent: 'center'}} onClick={() => setFeedbackModal(null)}>
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
