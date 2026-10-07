"use client";

import { useState, useEffect } from "react";
import Papa from "papaparse";
import dynamic from "next/dynamic";
import DOMPurify from "dompurify";
import "react-quill-new/dist/quill.snow.css";
import { cleanDraftBody } from "@/lib/cleanDraft";

const ReactQuill = dynamic(() => import("react-quill-new"), { ssr: false });

const sanitizeHtml = (html: string | undefined | null): string => {
  if (!html) return '';
  if (typeof window !== 'undefined' && DOMPurify && typeof DOMPurify.sanitize === 'function') {
    return DOMPurify.sanitize(html);
  }
  return html;
};

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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('activeTab', activeTab);
    }
  }, [activeTab]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (selectedLeadId) {
        localStorage.setItem('selectedLeadId', selectedLeadId);
      } else {
        localStorage.removeItem('selectedLeadId');
      }
    }
  }, [selectedLeadId]);

  // Modules state
  const [modules, setModules] = useState<{id: number, name: string}[]>([]);
  const [activeModule, setActiveModule] = useState<string>("Dentist");
  const [isAddingModule, setIsAddingModule] = useState(false);
  const [newModuleName, setNewModuleName] = useState("");

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('activeModule', activeModule);
    }
  }, [activeModule]);
  
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

  // Batch send reviewed emails state
  const [isBatchSendModalOpen, setIsBatchSendModalOpen] = useState(false);
  const [batchSending, setBatchSending] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    currentLeadName: string;
    results: { leadId: string; name: string; email: string; success: boolean; error?: string }[];
    done: boolean;
  }>({
    current: 0,
    total: 0,
    currentLeadName: '',
    results: [],
    done: false
  });

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
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Settings state
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [emailSignature, setEmailSignature] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [signatureMode, setSignatureMode] = useState<'rich' | 'html'>('rich');

  const handleCopyMessage = (msg: any) => {
    const textToCopy = msg.body || '';
    navigator.clipboard.writeText(textToCopy);
    setActiveMenuId(null);
    setFeedbackModal({ isOpen: true, type: 'success', title: 'Copied', message: 'Message copied to clipboard' });
  };

  const handleSendAgain = (msg: any) => {
    setReplyText(msg.htmlBody || msg.body || '');
    setActiveMenuId(null);
    setTimeout(() => {
      const replyBox = document.querySelector('.reply-editor-container');
      if (replyBox) {
        replyBox.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  const handleDeleteMessage = async (msg: any) => {
    setActiveMenuId(null);
    if (!confirm('Are you sure you want to delete this message?')) return;
    try {
      const res = await fetch('/api/gmail/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: msg.id })
      });
      if (res.ok) {
        setConversation(prev => prev.filter(m => m.id !== msg.id));
        setFeedbackModal({ isOpen: true, type: 'success', title: 'Deleted', message: 'Message deleted successfully' });
      } else {
        throw new Error('Failed to delete');
      }
    } catch (e) {
      setFeedbackModal({ isOpen: true, type: 'error', title: 'Error', message: 'Failed to delete message' });
    }
  };

  // Fetch leads and modules on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTab = localStorage.getItem('activeTab');
      if (savedTab) setActiveTab(savedTab);
      const savedLeadId = localStorage.getItem('selectedLeadId');
      if (savedLeadId) setSelectedLeadId(savedLeadId);
      const savedModule = localStorage.getItem('activeModule');
      if (savedModule) setActiveModule(savedModule);
    }

    fetch('/api/leads')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setLeads(data);
        } else {
          console.warn("API /api/leads did not return an array:", data);
          setLeads([]);
        }
        setIsLoading(false);
      })
      .catch(err => {
        console.error("Failed to load leads", err);
        setLeads([]);
        setIsLoading(false);
      });
      
    fetch('/api/modules')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setModules(data);
          setActiveModule(data[0].name);
        } else {
          setModules([{ id: 1, name: "Dentist" }]);
          setActiveModule("Dentist");
        }
      })
      .catch(err => {
        console.error("Failed to load modules", err);
        setModules([{ id: 1, name: "Dentist" }]);
        setActiveModule("Dentist");
      });

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
    if (!Array.isArray(leads) || leads.length === 0) return;
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
          if (Array.isArray(newLeads)) {
            setLeads(newLeads);
            setHasNewResponses(true);

            // If current selected lead was one of the replied leads, reload its conversation
            if (selectedLeadId && data.updatedLeadIds?.includes(selectedLeadId)) {
              const currentLead = newLeads.find((l: any) => l.lead_id === selectedLeadId);
              if (currentLead?.contact_info?.email && currentLead.contact_info.email.includes('@')) {
                fetch(`/api/gmail/conversation?email=${encodeURIComponent(currentLead.contact_info.email)}&alt_email=${encodeURIComponent(currentLead.contact_info.alt_email || '')}`)
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

  const safeLeads = Array.isArray(leads) ? leads : [];
  const selectedLead = safeLeads.find(l => l.lead_id === selectedLeadId);
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

    fetch(`/api/gmail/conversation?email=${encodeURIComponent(selectedLead.contact_info.email)}&alt_email=${encodeURIComponent(selectedLead.contact_info.alt_email || '')}`)
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
    setLeads(safeLeads.map(l => l.lead_id === leadId ? { ...l, status: newStatus, is_reviewed: newStatus === 'outreached' ? false : l.is_reviewed } : l));
    
    // API call
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, is_reviewed: newStatus === 'outreached' ? false : undefined })
      });
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  const moduleLeads = safeLeads.filter(lead => (lead.module || 'Dentist') === activeModule);
  const pendingCount = moduleLeads.filter(l => l.status === 'pending').length;
  const outreachedCount = moduleLeads.filter(l => l.status === 'outreached').length;
  const respondedCount = moduleLeads.filter(l => l.status === 'responded').length;
  const reviewedLeads = moduleLeads.filter(l => l.status === 'pending' && l.is_reviewed);
  const reviewedCount = reviewedLeads.length;

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

    setLeads(safeLeads.map(l => l.lead_id === updatedLead.lead_id ? updatedLead : l));
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
          fetch('/api/leads')
            .then(res => res.json())
            .then(d => {
              if (Array.isArray(d)) setLeads(d);
            })
            .catch(console.error);
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
          body: cleanDraftBody((lead.draft_message?.body || '').replace(/—/g, '-'))
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
        
        setLeads(safeLeads.map(l => l.lead_id === lead.lead_id ? { ...l, status: 'outreached', is_reviewed: false } : l));
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

  const saveDraftToDatabase = async (leadToSave?: any) => {
    const lead = leadToSave || selectedLead;
    if (!lead || !lead.lead_id) return;
    try {
      await fetch(`/api/leads/${lead.lead_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_reviewed: lead.is_reviewed,
          email_subject: (lead.draft_message?.subject || '').replace(/—/g, '-'),
          email_body: cleanDraftBody((lead.draft_message?.body || '').replace(/—/g, '-')),
          whatsapp_message: (lead.draft_message?.whatsapp || '').replace(/—/g, '-'),
          email: lead.contact_info?.email || '',
          alt_email: lead.contact_info?.alt_email || ''
        })
      });
    } catch (err) {
      console.error("Failed to save draft to database", err);
    }
  };

  // Debounced auto-save for mail draft edits to ensure DB is always up to date
  useEffect(() => {
    if (!selectedLead || !selectedLead.lead_id) return;
    const timer = setTimeout(() => {
      saveDraftToDatabase(selectedLead);
    }, 1000);
    return () => clearTimeout(timer);
  }, [
    selectedLead?.draft_message?.subject,
    selectedLead?.draft_message?.body,
    selectedLead?.draft_message?.whatsapp,
    selectedLead?.contact_info?.email
  ]);

  const toggleReviewLead = async (lead: any) => {
    if (!lead) return;
    const newReviewedState = !lead.is_reviewed;

    // 1. Optimistic update
    const updatedLead = {
      ...lead,
      is_reviewed: newReviewedState
    };
    setLeads(safeLeads.map(l => l.lead_id === lead.lead_id ? updatedLead : l));

    // 2. Persist to DB: both is_reviewed AND latest mail draft / contact info
    try {
      await fetch(`/api/leads/${lead.lead_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_reviewed: newReviewedState,
          email_subject: (lead.draft_message?.subject || '').replace(/—/g, '-'),
          email_body: cleanDraftBody((lead.draft_message?.body || '').replace(/—/g, '-')),
          whatsapp_message: (lead.draft_message?.whatsapp || '').replace(/—/g, '-'),
          email: lead.contact_info?.email || '',
          alt_email: lead.contact_info?.alt_email || ''
        })
      });
    } catch (err) {
      console.error("Failed to update reviewed status and draft", err);
    }
  };

  const executeBatchSendReviewed = async () => {
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

    const toSend = moduleLeads.filter(l => l.status === 'pending' && l.is_reviewed);
    if (toSend.length === 0) return;

    setBatchSending(true);
    setBatchProgress({
      current: 0,
      total: toSend.length,
      currentLeadName: toSend[0]?.business_name || '',
      results: [],
      done: false
    });

    const results: { leadId: string; name: string; email: string; success: boolean; error?: string }[] = [];
    const updatedLeadIds: string[] = [];

    for (let i = 0; i < toSend.length; i++) {
      const lead = toSend[i];
      setBatchProgress(prev => ({
        ...prev,
        current: i + 1,
        currentLeadName: lead.business_name
      }));

      if (!lead.contact_info?.email || !lead.contact_info.email.includes('@')) {
        results.push({
          leadId: lead.lead_id,
          name: lead.business_name,
          email: lead.contact_info?.email || 'Missing',
          success: false,
          error: 'No valid email address provided'
        });
        continue;
      }

      if (!lead.draft_message?.subject || !lead.draft_message?.body) {
        results.push({
          leadId: lead.lead_id,
          name: lead.business_name,
          email: lead.contact_info.email,
          success: false,
          error: 'Missing email subject or body'
        });
        continue;
      }

      try {
        const res = await fetch('/api/gmail/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId: lead.lead_id,
            to: lead.contact_info.email,
            cc: lead.draft_message?.cc,
            bcc: lead.draft_message?.bcc,
            subject: (lead.draft_message.subject || '').replace(/—/g, '-'),
            body: cleanDraftBody((lead.draft_message.body || '').replace(/—/g, '-'))
          })
        });

        const data = await res.json();
        if (data.success) {
          results.push({
            leadId: lead.lead_id,
            name: lead.business_name,
            email: lead.contact_info.email,
            success: true
          });
          updatedLeadIds.push(lead.lead_id);
        } else {
          results.push({
            leadId: lead.lead_id,
            name: lead.business_name,
            email: lead.contact_info.email,
            success: false,
            error: data.error || 'Failed to dispatch email'
          });
        }
      } catch (err: any) {
        results.push({
          leadId: lead.lead_id,
          name: lead.business_name,
          email: lead.contact_info.email,
          success: false,
          error: err?.message || 'Network error'
        });
      }

      if (i < toSend.length - 1) {
        await new Promise(r => setTimeout(r, 600));
      }
    }

    // Move successfully sent leads to outreached
    setLeads(prevLeads =>
      prevLeads.map(l =>
        updatedLeadIds.includes(l.lead_id)
          ? { ...l, status: 'outreached', is_reviewed: false, last_mail_sent: new Date().toISOString() }
          : l
      )
    );

    setBatchProgress(prev => ({
      ...prev,
      results,
      done: true
    }));
    setBatchSending(false);
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

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore
    }
    window.location.href = '/login';
  };

  return (
    <div className="app-container">
      {activeMenuId && (
        <div 
          style={{ position: 'fixed', inset: 0, zIndex: 9 }}
          onClick={() => setActiveMenuId(null)}
        />
      )}
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
                  {(Array.isArray(modules) ? modules : []).map(m => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                </select>
                <button className="btn" style={{padding: '4px 10px', fontWeight: 'bold'}} onClick={() => setIsAddingModule(true)} title="Add New Module">+</button>
              </>
            )}
          </div>
        </div>
        
        <div className="tabs-container" style={{ display: 'flex', gap: '8px', padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
          <button 
            className={`tab-btn ${activeTab === "pending" ? "active" : ""}`}
            style={{ 
              flex: activeTab === "pending" ? 1 : 'none',
              width: activeTab === "pending" ? 'auto' : 'auto',
              minWidth: activeTab === "pending" ? 'auto' : '40px',
              padding: activeTab === "pending" ? '6px 12px' : '6px 8px',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              transition: 'all 0.3s ease',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '4px'
            }}
            onClick={() => { 
              setActiveTab("pending"); 
              const leads = moduleLeads.filter(l => l.status === "pending");
              if (leads.length > 0) setSelectedLeadId(leads[0].lead_id);
              else setSelectedLeadId(null);
              setIsEditing(false); 
            }}
            title="Pending"
          >
            {activeTab === "pending" ? `Pending (${pendingCount})` : `P ${pendingCount}`}
          </button>
          
          <button 
            className={`tab-btn ${activeTab === "outreached" ? "active" : ""}`}
            style={{ 
              flex: activeTab === "outreached" ? 1 : 'none',
              width: activeTab === "outreached" ? 'auto' : 'auto',
              minWidth: activeTab === "outreached" ? 'auto' : '40px',
              padding: activeTab === "outreached" ? '6px 12px' : '6px 8px',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              transition: 'all 0.3s ease',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '4px'
            }}
            onClick={() => { 
              setActiveTab("outreached"); 
              const leads = moduleLeads.filter(l => l.status === "outreached");
              if (leads.length > 0) setSelectedLeadId(leads[0].lead_id);
              else setSelectedLeadId(null);
              setIsEditing(false); 
            }}
            title="Outreached"
          >
            {activeTab === "outreached" ? `Outreached (${outreachedCount})` : `O ${outreachedCount}`}
          </button>
          
          <button 
            className={`tab-btn ${activeTab === "responded" ? "active" : ""}`}
            style={{ 
              flex: activeTab === "responded" ? 1 : 'none',
              width: activeTab === "responded" ? 'auto' : 'auto',
              minWidth: activeTab === "responded" ? 'auto' : '40px',
              padding: activeTab === "responded" ? '6px 12px' : '6px 8px',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              transition: 'all 0.3s ease',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '4px',
              position: 'relative'
            }}
            onClick={() => { 
              setActiveTab("responded"); 
              const leads = moduleLeads.filter(l => l.status === "responded");
              if (leads.length > 0) setSelectedLeadId(leads[0].lead_id);
              else setSelectedLeadId(null);
              setIsEditing(false); 
              setHasNewResponses(false);
              if (typeof window !== 'undefined') localStorage.setItem('last_seen_responded_count', String(respondedCount));
            }}
            title="Responded"
          >
            {activeTab === "responded" ? `Responded (${respondedCount})` : `R ${respondedCount}`}
            {hasNewResponses && (
              <span 
                style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#ef4444',
                  boxShadow: '0 0 0 2px #fff, 0 0 6px #ef4444',
                  animation: 'pulse 1.5s infinite',
                  position: activeTab === "responded" ? 'static' : 'absolute',
                  top: activeTab === "responded" ? 'auto' : '-2px',
                  right: activeTab === "responded" ? 'auto' : '-2px'
                }} 
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                <h3 style={{ margin: 0, flex: 1 }}>{lead.business_name}</h3>
                {lead.status === 'pending' && lead.is_reviewed && (
                  <span 
                    style={{ 
                      fontSize: '10px', 
                      fontWeight: 700, 
                      background: '#dcfce7', 
                      color: '#15803d', 
                      border: '1px solid #86efac', 
                      borderRadius: '10px', 
                      padding: '1px 6px',
                      whiteSpace: 'nowrap'
                    }}
                    title="Staged in reviewed group"
                  >
                    ✓ Reviewed
                  </span>
                )}
              </div>
              <p>
                <span className={`badge ${getTierClass(lead.tier)}`}>{lead.tier}</span>
                {lead.area}
              </p>
              <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {lead.status === 'pending' && <div>Added: --</div>}
                {lead.status === 'outreached' && lead.last_mail_sent && <div>Outreached: {new Date(lead.last_mail_sent).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>}
                {lead.status === 'responded' && lead.last_response_received && <div>Responded: {new Date(lead.last_response_received).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>}
                {lead.status === 'responded' && !lead.last_response_received && lead.last_mail_sent && <div>Sent: {new Date(lead.last_mail_sent).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>}
              </div>
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
        <header className="topbar">
          <div style={{display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap'}}>
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

            <button 
              className="btn"
              onClick={() => {
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
                if (reviewedCount === 0) {
                  setFeedbackModal({
                    isOpen: true,
                    type: 'warning',
                    title: 'No Reviewed Leads',
                    message: 'There are no pending leads marked as reviewed. Click the "Reviewed" button on pending leads to stage them in this group.'
                  });
                  return;
                }
                setBatchProgress({
                  current: 0,
                  total: reviewedCount,
                  currentLeadName: '',
                  results: [],
                  done: false
                });
                setIsBatchSendModalOpen(true);
              }}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: reviewedCount > 0 ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' : '#f8fafc',
                color: reviewedCount > 0 ? '#ffffff' : '#64748b',
                border: reviewedCount > 0 ? '1px solid #0284c7' : '1px solid var(--line)',
                boxShadow: reviewedCount > 0 ? '0 2px 8px rgba(2, 132, 199, 0.35)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                borderRadius: '6px'
              }}
              title={reviewedCount > 0 ? `Send ${reviewedCount} reviewed outreach emails` : "No leads in reviewed group"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
              <span>Send all reviewed mails</span>
              <span style={{
                background: reviewedCount > 0 ? '#ffffff' : '#e2e8f0',
                color: reviewedCount > 0 ? '#0369a1' : '#64748b',
                padding: '1px 7px',
                borderRadius: '10px',
                fontSize: '11px',
                fontWeight: 700
              }}>
                {reviewedCount}
              </span>
            </button>
          </div>
          <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '4px', borderLeft: '1px solid var(--line)', paddingLeft: '10px' }}>
              <div 
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--bg)',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  border: '1px solid var(--line)',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--ink)'
                }}
                title="Logged in as Tuhin"
              >
                <span style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  color: '#fff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  fontWeight: 700
                }}>
                  T
                </span>
                <span>Tuhin</span>
              </div>
              <button 
                className="btn" 
                style={{ padding: '6px 10px', fontSize: '12px', fontWeight: 600, color: 'var(--bad)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                onClick={handleLogout}
                title="Sign out of Outreach Hub"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Logout
              </button>
            </div>
          </div>
        </header>


        {selectedLead ? (
          <div className="center-view">
            
            {/* Email Outreach (Only if conversation not active) */}
            {!isConversationActive && (
              <div className="sec center-sec" style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0 }}>Email Outreach</h3>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {selectedLead.status === 'pending' && (
                      <>
                        <button 
                          className="btn"
                          style={selectedLead.is_reviewed 
                            ? { background: '#059669', color: '#fff', borderColor: '#059669', padding: '4px 12px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }
                            : { background: '#f0fdf4', color: '#166534', borderColor: '#bbf7d0', padding: '4px 12px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }
                          }
                          onClick={() => toggleReviewLead(selectedLead)}
                          title={selectedLead.is_reviewed ? "Lead is in reviewed group (click to unmark)" : "Mark as reviewed and add to background send group"}
                        >
                          {selectedLead.is_reviewed ? (
                            <>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                              <span>Reviewed</span>
                            </>
                          ) : (
                            <>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                              <span>Reviewed</span>
                            </>
                          )}
                        </button>
                        <button className="btn primary" style={{background: '#10b981', color: '#fff', borderColor: '#10b981', padding: '4px 10px', fontSize: '12px'}} onClick={() => changeLeadStatus(selectedLead.lead_id, 'outreached')}>
                          ✓ Mark as Outreached
                        </button>
                      </>
                    )}
                    {selectedLead.status === 'outreached' && (
                      <button className="btn primary" style={{background: '#8b5cf6', color: '#fff', borderColor: '#8b5cf6', padding: '4px 10px', fontSize: '12px'}} onClick={() => changeLeadStatus(selectedLead.lead_id, 'responded')}>
                        ★ Mark as Responded
                      </button>
                    )}
                    {(selectedLead.status === 'outreached' || selectedLead.status === 'responded') && (
                      <button className="btn" style={{color: 'var(--muted)', padding: '4px 10px', fontSize: '12px'}} onClick={() => changeLeadStatus(selectedLead.lead_id, 'pending')}>
                        ↩ Revert
                      </button>
                    )}
                  </div>
                </div>
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
                          onBlur={(e) => { e.target.style.border = '1px solid transparent'; e.target.style.background = 'transparent'; saveDraftToDatabase(selectedLead); }}
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
                          onBlur={(e) => { e.target.style.border = '1px solid transparent'; e.target.style.background = 'transparent'; saveDraftToDatabase(selectedLead); }}
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
                          onBlur={(e) => { e.target.style.border = '1px solid transparent'; e.target.style.background = 'transparent'; saveDraftToDatabase(selectedLead); }}
                          placeholder="Optional BCC (comma-separated)"
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button className="btn" onClick={() => copyToClipboard(cleanDraftBody(selectedLead.draft_message?.body || '').replace(/—/g, '-'))}>Copy Body</button>
                      {selectedLead.status === 'pending' && (
                        <button 
                          className="btn"
                          style={selectedLead.is_reviewed 
                            ? { background: '#059669', color: '#fff', borderColor: '#059669', padding: '6px 14px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }
                            : { background: '#f0fdf4', color: '#166534', borderColor: '#bbf7d0', padding: '6px 14px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }
                          }
                          onClick={() => toggleReviewLead(selectedLead)}
                          title={selectedLead.is_reviewed ? "Lead is in reviewed group (click to toggle)" : "Mark as reviewed and add to background send group"}
                        >
                          {selectedLead.is_reviewed ? (
                            <>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                              <span>Reviewed</span>
                            </>
                          ) : (
                            <>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                              <span>Reviewed</span>
                            </>
                          )}
                        </button>
                      )}
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
                    <textarea 
                      rows={2}
                      value={(selectedLead.draft_message?.subject || '').replace(/—/g, '-')} 
                      onChange={(e) => handleInputChange('draft_message.subject', e.target.value)}
                      onBlur={() => saveDraftToDatabase(selectedLead)}
                      style={{ resize: 'none', padding: '0', margin: '0' }}
                    />
                  </div>
                  <div style={{ background: '#fff', borderRadius: '6px', border: '1px solid var(--line)', overflow: 'hidden' }}>
                    <ReactQuill 
                      theme="snow"
                      value={formatForQuill(selectedLead.draft_message?.body)} 
                      onChange={(content: string) => handleInputChange('draft_message.body', content)}
                      onBlur={() => saveDraftToDatabase(selectedLead)}
                      style={{background: '#fff', border: 'none'}}
                    />
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--accent)' }}>
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="16" x2="12" y2="12"></line>
                      <line x1="12" y1="8" x2="12.01" y2="8"></line>
                    </svg>
                    <span>Default email signature (from Settings) will be appended automatically upon sending.</span>
                  </div>
                </div>
              </div>
            )}

            {/* Conversation History Section */}
            <div className="sec center-sec" style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>💬 Conversation History</span>
                  {conversation.length > 0 && (
                    <span style={{ fontSize: '11px', background: 'var(--accent-soft)', color: 'var(--accent)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                      {conversation.length} message{conversation.length > 1 ? 's' : ''}
                    </span>
                  )}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {isConversationActive && selectedLead.status === 'pending' && (
                    <button className="btn primary" style={{background: '#10b981', color: '#fff', borderColor: '#10b981', padding: '4px 10px', fontSize: '12px'}} onClick={() => changeLeadStatus(selectedLead.lead_id, 'outreached')}>
                      ✓ Mark as Outreached
                    </button>
                  )}
                  {isConversationActive && selectedLead.status === 'outreached' && (
                    <button className="btn primary" style={{background: '#8b5cf6', color: '#fff', borderColor: '#8b5cf6', padding: '4px 10px', fontSize: '12px'}} onClick={() => changeLeadStatus(selectedLead.lead_id, 'responded')}>
                      ★ Mark as Responded
                    </button>
                  )}
                  {isConversationActive && (selectedLead.status === 'outreached' || selectedLead.status === 'responded') && (
                    <button className="btn" style={{color: 'var(--muted)', padding: '4px 10px', fontSize: '12px'}} onClick={() => changeLeadStatus(selectedLead.lead_id, 'pending')}>
                      ↩ Revert
                    </button>
                  )}
                  {gmailConnected && selectedLead.contact_info?.email?.includes('@') && (
                    <button 
                      className="btn" 
                      style={{ padding: '4px 8px', fontSize: '11px' }}
                      disabled={loadingConversation}
                      onClick={() => {
                        setLoadingConversation(true);
                        fetch(`/api/gmail/conversation?email=${encodeURIComponent(selectedLead.contact_info.email)}&alt_email=${encodeURIComponent(selectedLead.contact_info.alt_email || '')}`)
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                            <span style={{ fontSize: '10.5px' }}>{msg.date}</span>
                            <button 
                              onClick={() => setActiveMenuId(activeMenuId === msgKey ? null : msgKey)}
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 4px', color: 'var(--muted)', fontSize: '14px' }}
                            >
                              ⋮
                            </button>
                            {activeMenuId === msgKey && (
                              <div style={{
                                position: 'absolute',
                                right: 0,
                                top: '20px',
                                background: '#fff',
                                border: '1px solid var(--line)',
                                borderRadius: '6px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                zIndex: 10,
                                width: '120px',
                                overflow: 'hidden',
                                display: 'flex',
                                flexDirection: 'column'
                              }}>
                                <button onClick={() => handleSendAgain(msg)} style={{ padding: '8px 12px', textAlign: 'left', border: 'none', background: 'transparent', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid var(--line)' }} className="hover:bg-slate-50">Send Again</button>
                                <button onClick={() => handleCopyMessage(msg)} style={{ padding: '8px 12px', textAlign: 'left', border: 'none', background: 'transparent', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid var(--line)' }} className="hover:bg-slate-50">Copy</button>
                                <button onClick={() => handleDeleteMessage(msg)} style={{ padding: '8px 12px', textAlign: 'left', border: 'none', background: 'transparent', fontSize: '12px', cursor: 'pointer', color: '#ef4444' }} className="hover:bg-red-50">Delete</button>
                              </div>
                            )}
                          </div>
                        </div>
                        {msg.subject && (
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)', marginBottom: '4px', wordBreak: 'break-word' }}>
                            {msg.subject}
                          </div>
                        )}
                        <div style={{ fontSize: '13px', lineHeight: '1.5', whiteSpace: msg.htmlBody ? 'normal' : 'pre-wrap', color: 'var(--ink)', wordBreak: 'break-word', overflowX: 'auto' }}>
                          {msg.htmlBody ? (
                            <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(msg.htmlBody) }} />
                          ) : (
                            cleanBody
                          )}
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
                  <div className="reply-editor-container" style={{ background: '#fff', borderRadius: '6px', border: '1px solid var(--line)', overflow: 'hidden' }}>
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
        ) : (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{marginBottom: '16px', opacity: 0.5}}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
            <h2>Select a Lead</h2>
            <p style={{marginTop: 0}}>Choose a lead from the sidebar to review and send.</p>
          </div>
        )}

      </main>

      {selectedLead && (
        <aside className="right-sidebar">
          <div className="detail-view" style={{ border: 'none', borderRadius: 0, boxShadow: 'none', background: 'transparent', padding: '16px' }}>
            <div className="detail-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '0 0 20px 0', background: 'transparent', color: 'var(--ink)', borderBottom: '1px solid var(--line)', marginBottom: '20px'}}>
              <div>
                <h2 style={{ color: 'var(--ink)', fontSize: '22px', margin: '0 0 12px 0', fontWeight: 800, letterSpacing: '-0.02em' }}>{selectedLead.business_name}</h2>
                <div className="detail-meta" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', color: 'var(--muted)', fontSize: '13px', fontWeight: 500, alignItems: 'center' }}>
                  <span style={{display:'flex', alignItems:'center', gap:'4px'}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>{selectedLead.area}</span>
                  <span style={{display:'flex', alignItems:'center', gap:'4px'}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>{selectedLead.owner_details?.name || 'N/A'}</span>
                  <span><span className={`badge ${getTierClass(selectedLead.tier)}`} style={{fontSize:'11px', padding:'3px 8px'}}>{selectedLead.tier}</span></span>
                </div>
              </div>
              <button 
                className="btn" 
                style={{whiteSpace: 'nowrap'}}
                onClick={() => setIsEditing(true)}
              >
                Edit
              </button>
            </div>

            <div className="detail-body" style={{ background: 'transparent', padding: '16px 0' }}>
              <div className="sidebar-card">
                <h3 style={{ fontSize: '14px', marginTop: 0 }}>Contact Info</h3>
                <div className="grid" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="kv">
                    <div className="k">Address & Location</div>
                    <ul className="comp-list" style={{marginTop:0}}>
                      <li>{selectedLead.contact_info?.address || 'N/A'}</li>
                      {selectedLead.contact_info?.location_note && <li>{selectedLead.contact_info.location_note}</li>}
                      {getFirstUrl(selectedLead.contact_info?.google_maps) && (
                        <li><a href={getFirstUrl(selectedLead.contact_info.google_maps)} target="_blank" rel="noreferrer" style={{color:'var(--brand)', textDecoration:'underline'}}>📍 Open in Google Maps</a></li>
                      )}
                    </ul>
                  </div>
                  <div className="kv">
                    <div className="k">Email & Phone</div>
                    <ul className="comp-list" style={{marginTop:0, display: 'flex', flexDirection: 'column', gap: '8px'}}>
                      <li style={{display:'flex', alignItems:'center', gap: '6px'}}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                        <a href={`mailto:${selectedLead.contact_info?.email}`} style={{color:'var(--brand)', textDecoration:'underline'}}>{selectedLead.contact_info?.email || 'N/A'}</a>
                        {selectedLead.contact_info?.email && <span onClick={() => copyToClipboard(selectedLead.contact_info.email)} title="Copy Email"><CopyIcon /></span>}
                      </li>
                      {selectedLead.contact_info?.alt_email && (
                        <li style={{display:'flex', alignItems:'center', gap: '6px'}}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                          <span>{selectedLead.contact_info.alt_email}</span>
                        </li>
                      )}
                      
                      <li style={{display:'flex', alignItems:'center', gap: '6px', flexWrap: 'wrap'}}>
                        {extractPhone(selectedLead.contact_info?.phone_whatsapp) ? (
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
                             <span>{selectedLead.contact_info?.phone_whatsapp || 'N/A'}</span>
                          </div>
                        )}
                      </li>
                    </ul>
                  </div>
                  <div className="kv">
                    <div className="k">Website & Social Media</div>
                    <div className="v" style={{display:'flex', gap:'16px', alignItems:'center', marginTop:'8px'}}>
                      {selectedLead.contact_info?.website ? (
                        <a href={selectedLead.contact_info.website} target="_blank" rel="noreferrer" title="Website" style={{color: 'var(--fg)', textDecoration: 'none'}}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                        </a>
                      ) : <span style={{color:'var(--muted)', fontSize:'12px'}}>No Web</span>}
                      {getFirstUrl(selectedLead.contact_info?.facebook) ? (
                        <a href={getFirstUrl(selectedLead.contact_info.facebook)} target="_blank" rel="noreferrer" title="Facebook">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                        </a>
                      ) : <span style={{color:'var(--muted)', fontSize:'12px'}}>No FB</span>}
                      {getFirstUrl(selectedLead.contact_info?.linkedin) ? (
                        <a href={getFirstUrl(selectedLead.contact_info.linkedin)} target="_blank" rel="noreferrer" title="LinkedIn">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                        </a>
                      ) : <span style={{color:'var(--muted)', fontSize:'12px'}}>No IN</span>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="sidebar-card">
                <h3 style={{ fontSize: '14px', marginTop: 0 }}>Business Profile</h3>
                <div className="grid" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="kv">
                    <div className="k">Scale & Hours</div>
                    <ul className="comp-list" style={{marginTop:0}}>
                      <li><strong>Scale:</strong> {selectedLead.business_context?.business_size || 'N/A'}</li>
                      <li><strong>Hours:</strong> {selectedLead.business_context?.hours || 'N/A'}</li>
                    </ul>
                  </div>
                  <div className="kv">
                    <div className="k">Credentials</div>
                    <ul className="comp-list" style={{marginTop:0}}>
                      <li>{selectedLead.owner_details?.license_credentials || 'N/A'}</li>
                      <li>{selectedLead.owner_details?.graduation_experience || 'N/A'}</li>
                    </ul>
                  </div>
                  <div className="kv">
                    <div className="k">Age & Opening</div>
                    <ul className="comp-list" style={{marginTop:0}}>
                      <li><strong>Opened:</strong> {selectedLead.business_context?.opened_since || 'N/A'}</li>
                      <li><strong>Founder Est:</strong> {selectedLead.business_context?.founder_age_est || 'N/A'} {selectedLead.business_context?.age_flag}</li>
                    </ul>
                  </div>
                  <div className="kv" style={{gridColumn: '1 / -1'}}>
                    <div className="k">Competitors & Notes</div>
                    <div className="v" style={{fontSize: '13px', lineHeight: '1.6'}}>
                      <strong style={{color:'var(--brand)'}}>Competitors:</strong>
                      {selectedLead.business_context?.local_competitors ? (
                        <ul className="comp-list">
                          {selectedLead.business_context.local_competitors.split('|').map((comp: string, i: number) => (
                            <li key={i}>{comp.trim()}</li>
                          ))}
                        </ul>
                      ) : (
                        <div style={{marginBottom:'8px'}}>None listed</div>
                      )}
                      
                      <strong style={{color:'var(--brand)'}}>Sources:</strong> <span style={{color:'var(--muted)'}}>{selectedLead.business_context?.sources || 'N/A'}</span><br/>
                      <div style={{marginTop: '8px'}}>
                        <strong style={{color:'var(--brand)'}}>Notes:</strong>
                        <div className="note-box">
                           {selectedLead.business_context?.other_channels_notes || 'No additional notes.'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="sidebar-card">
                <h3 style={{ fontSize: '14px', marginTop: 0 }}>Marketing Angle</h3>
                <div className="flag warn">
                  <strong>Snapshot:</strong> {selectedLead.marketing_angles?.snapshot || 'N/A'}<br/>
                  <strong>Angle:</strong> {selectedLead.marketing_angles?.automation_angle || 'N/A'}
                </div>
              </div>

              <div className="sidebar-card">
                <h3 style={{ fontSize: '14px', marginTop: 0 }}>WhatsApp Outreach</h3>
                <div className="mail">
                  <div className="bar" style={{ marginBottom: '8px' }}>
                    <button className="btn" onClick={() => copyToClipboard((selectedLead.draft_message?.whatsapp || '').replace(/—/g, '-'))}>Copy</button>
                    <a className="btn primary" href={`https://wa.me/${selectedLead.contact_info?.phone_whatsapp?.replace(/[^0-9]/g, '')}?text=${encodeURIComponent((selectedLead.draft_message?.whatsapp || '').replace(/—/g, '-'))}`} target="_blank" rel="noreferrer">Open</a>
                  </div>
                  <textarea 
                    style={{minHeight: '120px', width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px', fontSize: '13px'}}
                    value={(selectedLead.draft_message?.whatsapp || '').replace(/—/g, '-')}
                    onChange={(e) => handleInputChange('draft_message.whatsapp', e.target.value)}
                  />
                </div>
              </div>

            </div>
          </div>
        </aside>
      )}

      {isEditing && selectedLead && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000}}>
          <div style={{background: '#fff', padding: '24px', borderRadius: '12px', width: '600px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.1)'}}>
            <h2 style={{marginTop: 0, fontSize: '18px', borderBottom: '1px solid var(--line)', paddingBottom: '12px'}}>Edit Lead Details</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
              <h3 style={{ fontSize: '14px', margin: '0 0 -8px 0', color: 'var(--ink)' }}>Basic Info</h3>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>Business Name</label>
                <input style={{width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px'}} value={selectedLead.business_name || ''} onChange={(e) => handleInputChange('business_name', e.target.value)} />
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>Owner Name</label>
                  <input style={{width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px'}} value={selectedLead.owner_details?.name || ''} onChange={(e) => handleInputChange('owner_details.name', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>Area</label>
                  <input style={{width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px'}} value={selectedLead.area || ''} onChange={(e) => handleInputChange('area', e.target.value)} />
                </div>
              </div>

              <h3 style={{ fontSize: '14px', margin: '8px 0 -8px 0', color: 'var(--ink)' }}>Contact Details</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>Email</label>
                  <input style={{width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px'}} value={selectedLead.contact_info?.email || ''} onChange={(e) => handleInputChange('contact_info.email', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>Alt Email</label>
                  <input style={{width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px'}} value={selectedLead.contact_info?.alt_email || ''} onChange={(e) => handleInputChange('contact_info.alt_email', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>Phone / WhatsApp</label>
                  <input style={{width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px'}} value={selectedLead.contact_info?.phone_whatsapp || ''} onChange={(e) => handleInputChange('contact_info.phone_whatsapp', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>Website</label>
                  <input style={{width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px'}} value={selectedLead.contact_info?.website || ''} onChange={(e) => handleInputChange('contact_info.website', e.target.value)} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>Address</label>
                <input style={{width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px'}} value={selectedLead.contact_info?.address || ''} onChange={(e) => handleInputChange('contact_info.address', e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>Location Note</label>
                  <input style={{width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px'}} value={selectedLead.contact_info?.location_note || ''} onChange={(e) => handleInputChange('contact_info.location_note', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>Google Maps URL</label>
                  <input style={{width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px'}} value={selectedLead.contact_info?.google_maps || ''} onChange={(e) => handleInputChange('contact_info.google_maps', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>Facebook</label>
                  <input style={{width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px'}} value={selectedLead.contact_info?.facebook || ''} onChange={(e) => handleInputChange('contact_info.facebook', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>LinkedIn</label>
                  <input style={{width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px'}} value={selectedLead.contact_info?.linkedin || ''} onChange={(e) => handleInputChange('contact_info.linkedin', e.target.value)} />
                </div>
              </div>

              <h3 style={{ fontSize: '14px', margin: '8px 0 -8px 0', color: 'var(--ink)' }}>Business Context</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>Scale / Size</label>
                  <input style={{width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px'}} value={selectedLead.business_context?.business_size || ''} onChange={(e) => handleInputChange('business_context.business_size', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>Hours</label>
                  <input style={{width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px'}} value={selectedLead.business_context?.hours || ''} onChange={(e) => handleInputChange('business_context.hours', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>License / Credentials</label>
                  <input style={{width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px'}} value={selectedLead.owner_details?.license_credentials || ''} onChange={(e) => handleInputChange('owner_details.license_credentials', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>Graduation / Experience</label>
                  <input style={{width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px'}} value={selectedLead.owner_details?.graduation_experience || ''} onChange={(e) => handleInputChange('owner_details.graduation_experience', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>Opened Since</label>
                  <input style={{width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px'}} value={selectedLead.business_context?.opened_since || ''} onChange={(e) => handleInputChange('business_context.opened_since', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>Founder Age</label>
                  <input style={{width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px'}} value={selectedLead.business_context?.founder_age_est || ''} onChange={(e) => handleInputChange('business_context.founder_age_est', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>Age Flag</label>
                  <input style={{width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px'}} value={selectedLead.business_context?.age_flag || ''} onChange={(e) => handleInputChange('business_context.age_flag', e.target.value)} />
                </div>
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>Competitors</label>
                <input style={{width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px'}} value={selectedLead.business_context?.local_competitors || ''} onChange={(e) => handleInputChange('business_context.local_competitors', e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>Sources</label>
                <input style={{width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px'}} value={selectedLead.business_context?.sources || ''} onChange={(e) => handleInputChange('business_context.sources', e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>Notes</label>
                <textarea style={{width: '100%', minHeight: '80px', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px'}} value={selectedLead.business_context?.other_channels_notes || ''} onChange={(e) => handleInputChange('business_context.other_channels_notes', e.target.value)} />
              </div>

              <h3 style={{ fontSize: '14px', margin: '8px 0 -8px 0', color: 'var(--ink)' }}>Marketing Angle</h3>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>Marketing Snapshot</label>
                <input style={{width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px'}} value={selectedLead.marketing_angles?.snapshot || ''} onChange={(e) => handleInputChange('marketing_angles.snapshot', e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>Automation Angle</label>
                <input style={{width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '6px'}} value={selectedLead.marketing_angles?.automation_angle || ''} onChange={(e) => handleInputChange('marketing_angles.automation_angle', e.target.value)} />
              </div>

            </div>
            
<div style={{marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--line)', paddingTop: '16px'}}>
              <button className="btn" onClick={() => { 
                setIsEditing(false); 
                // Re-fetch lead to discard changes if needed, but for simplicity just hide it.
                // It's local state, so if they didn't save, it might remain in `selectedLead`.
                // A true discard requires reverting, but keeping it simple for now.
              }}>Cancel</button>
              <button className="btn primary" onClick={() => { saveLeadEdits(); setIsEditing(false); }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

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
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml((emailSignature || '<span style="color: var(--muted); font-style: italic;">No signature content</span>').replace(/<p>/gi, '<p style="margin: 0; padding: 0; line-height: 1.2;">')) }}
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
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(cleanDraftBody(sendTargetLead.draft_message?.body || '') + (emailSignature ? (
                  /^\s*(?:<[^>]+>)*\s*(?:Best regards|Kind regards|Warm regards|Regards|Sincerely)[,\.]?/i.test(emailSignature)
                    ? `<div style="margin-top: 16px; margin-bottom: 8px;"></div><div>${emailSignature.replace(/<p>/gi, '<p style="margin: 0; padding: 0; line-height: 1.2;">')}</div>`
                    : `<div style="margin-top: 16px; margin-bottom: 8px;">Best regards,</div><div>${emailSignature.replace(/<p>/gi, '<p style="margin: 0; padding: 0; line-height: 1.2;">')}</div>`
                ) : '')) }}
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

      {isBatchSendModalOpen && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(3px)'}}>
          <div style={{background: '#fff', padding: '28px', borderRadius: '16px', width: '680px', maxWidth: '94%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.18)', border: '1px solid var(--line)'}}>
            {/* Header */}
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: '14px'}}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)'
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </div>
                <div>
                  <h2 style={{margin: 0, fontSize: '20px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em'}}>
                    Send All Reviewed Mails
                  </h2>
                  <div style={{fontSize: '12.5px', color: 'var(--muted)', marginTop: '3px'}}>
                    Module: <strong style={{color: 'var(--ink)'}}>{activeModule}</strong> • <strong>{reviewedLeads.length}</strong> lead{reviewedLeads.length !== 1 ? 's' : ''} staged in background group
                  </div>
                </div>
              </div>
              {!batchSending && (
                <button 
                  onClick={() => setIsBatchSendModalOpen(false)}
                  style={{background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px', color: 'var(--muted)', fontSize: '18px', borderRadius: '6px'}}
                  title="Close"
                >
                  ✕
                </button>
              )}
            </div>

            {/* State 1: Confirmation / Staged List */}
            {!batchSending && !batchProgress.done && (
              <>
                <div style={{
                  background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                  border: '1px solid #bae6fd',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <div style={{fontSize: '22px'}}>📬</div>
                  <div style={{fontSize: '13px', color: '#0369a1', lineHeight: '1.5'}}>
                    You have <strong>{reviewedLeads.length}</strong> reviewed email{reviewedLeads.length !== 1 ? 's' : ''} staged in the background group. Each will be automatically dispatched via your connected Gmail (<strong>{gmailEmail}</strong>) and moved immediately to <strong>Outreached</strong>.
                  </div>
                </div>

                <div style={{marginBottom: '14px'}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                    <span style={{fontSize: '12px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em'}}>
                      Leads in Reviewed Group ({reviewedLeads.length})
                    </span>
                    <span style={{fontSize: '11px', color: 'var(--muted)'}}>
                      All saved draft edits will be sent
                    </span>
                  </div>

                  <div style={{
                    maxHeight: '260px',
                    overflowY: 'auto',
                    border: '1px solid var(--line)',
                    borderRadius: '8px',
                    background: '#f8fafc',
                    padding: '8px'
                  }}>
                    {reviewedLeads.map((lead, idx) => (
                      <div 
                        key={lead.lead_id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          background: '#fff',
                          borderRadius: '6px',
                          border: '1px solid var(--line)',
                          marginBottom: idx === reviewedLeads.length - 1 ? 0 : '6px',
                          gap: '12px'
                        }}
                      >
                        <div style={{minWidth: 0, flex: 1}}>
                          <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                            <span style={{fontWeight: 700, fontSize: '13px', color: 'var(--ink)'}}>
                              {lead.business_name}
                            </span>
                            <span className={`badge ${getTierClass(lead.tier)}`} style={{fontSize: '10px', padding: '1px 6px'}}>
                              {lead.tier}
                            </span>
                            <span style={{fontSize: '11px', color: 'var(--muted)'}}>
                              • {lead.area}
                            </span>
                          </div>
                          <div style={{fontSize: '12px', color: 'var(--muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                            <span style={{color: 'var(--brand)', fontWeight: 500}}>{lead.contact_info?.email || '⚠️ Missing email'}</span>
                            <span>|</span>
                            <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>Subject: {lead.draft_message?.subject || '(No subject)'}</span>
                          </div>
                        </div>
                        <button
                          className="btn"
                          style={{fontSize: '11px', padding: '3px 8px', color: '#ef4444', borderColor: '#fecaca', background: '#fff'}}
                          onClick={() => toggleReviewLead(lead)}
                          title="Remove from reviewed group"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '10px'}}>
                  <button className="btn" onClick={() => setIsBatchSendModalOpen(false)}>
                    Cancel
                  </button>
                  <button 
                    className="btn primary" 
                    onClick={executeBatchSendReviewed}
                    style={{
                      background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                      borderColor: '#0284c7',
                      padding: '8px 20px',
                      fontSize: '13px',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 12px rgba(2, 132, 199, 0.35)'
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13"></line>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                    Send All {reviewedLeads.length} Mails Now
                  </button>
                </div>
              </>
            )}

            {/* State 2: Sending in Progress */}
            {batchSending && (
              <div style={{padding: '16px 0'}}>
                <div style={{marginBottom: '20px'}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                    <span style={{fontSize: '13px', fontWeight: 600, color: 'var(--ink)'}}>
                      Sending {batchProgress.current} of {batchProgress.total} emails...
                    </span>
                    <span style={{fontSize: '13px', fontWeight: 700, color: 'var(--brand)'}}>
                      {Math.round((batchProgress.current / batchProgress.total) * 100)}%
                    </span>
                  </div>
                  {/* Progress bar container */}
                  <div style={{width: '100%', height: '10px', background: '#e2e8f0', borderRadius: '5px', overflow: 'hidden'}}>
                    <div style={{
                      width: `${Math.round((batchProgress.current / batchProgress.total) * 100)}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #0284c7 0%, #10b981 100%)',
                      transition: 'width 0.4s ease'
                    }} />
                  </div>
                </div>

                <div style={{
                  padding: '14px',
                  background: '#f8fafc',
                  border: '1px solid var(--line)',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <div style={{
                    width: '18px',
                    height: '18px',
                    border: '2px solid var(--brand)',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
                  <div style={{fontSize: '13px', color: 'var(--ink)'}}>
                    Currently dispatching: <strong>{batchProgress.currentLeadName}</strong>
                  </div>
                </div>

                {/* Real-time results feed */}
                <div style={{maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--line)', borderRadius: '8px', padding: '8px', background: '#fff'}}>
                  {batchProgress.results.map((res, i) => (
                    <div 
                      key={i}
                      style={{
                        padding: '6px 10px',
                        fontSize: '12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderBottom: i === batchProgress.results.length - 1 ? 'none' : '1px solid #f1f5f9'
                      }}
                    >
                      <span style={{fontWeight: 600, color: 'var(--ink)'}}>{res.name}</span>
                      {res.success ? (
                        <span style={{color: '#15803d', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px'}}>
                          ✓ Sent & Outreached
                        </span>
                      ) : (
                        <span style={{color: '#dc2626', fontWeight: 600}}>
                          ❌ {res.error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* State 3: Finished / Summary */}
            {batchProgress.done && (
              <div style={{padding: '10px 0'}}>
                {(() => {
                  const successCount = batchProgress.results.filter(r => r.success).length;
                  const failCount = batchProgress.results.filter(r => !r.success).length;
                  return (
                    <>
                      <div style={{
                        background: failCount === 0 ? '#dcfce7' : '#fef3c7',
                        border: `1px solid ${failCount === 0 ? '#86efac' : '#fde047'}`,
                        borderRadius: '10px',
                        padding: '16px',
                        textAlign: 'center',
                        marginBottom: '20px'
                      }}>
                        <div style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '50%',
                          background: failCount === 0 ? '#15803d' : '#b45309',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          margin: '0 auto 10px auto',
                          fontSize: '20px'
                        }}>
                          {failCount === 0 ? '✓' : '!'}
                        </div>
                        <h3 style={{margin: '0 0 6px 0', fontSize: '17px', color: failCount === 0 ? '#15803d' : '#92400e'}}>
                          {failCount === 0 ? 'All Reviewed Emails Sent Successfully!' : 'Outreach Dispatch Completed with Notices'}
                        </h3>
                        <p style={{margin: 0, fontSize: '13px', color: failCount === 0 ? '#166534' : '#78350f'}}>
                          {successCount} email{successCount !== 1 ? 's' : ''} successfully delivered via Gmail and moved to <strong>Outreached</strong>.
                          {failCount > 0 && ` ${failCount} email(s) could not be sent (details below).`}
                        </p>
                      </div>

                      <div style={{maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--line)', borderRadius: '8px', padding: '8px', background: '#fff', marginBottom: '20px'}}>
                        {batchProgress.results.map((res, i) => (
                          <div 
                            key={i}
                            style={{
                              padding: '8px 10px',
                              fontSize: '12.5px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              borderBottom: i === batchProgress.results.length - 1 ? 'none' : '1px solid #f1f5f9'
                            }}
                          >
                            <div>
                              <div style={{fontWeight: 600, color: 'var(--ink)'}}>{res.name}</div>
                              <div style={{fontSize: '11px', color: 'var(--muted)'}}>{res.email}</div>
                            </div>
                            {res.success ? (
                              <span style={{color: '#15803d', background: '#f0fdf4', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700}}>
                                ✓ Outreached
                              </span>
                            ) : (
                              <span style={{color: '#b91c1c', background: '#fef2f2', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600}}>
                                ⚠️ {res.error}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>

                      <div style={{display: 'flex', justifyContent: 'flex-end', gap: '10px'}}>
                        <button 
                          className="btn" 
                          onClick={() => {
                            setIsBatchSendModalOpen(false);
                          }}
                        >
                          Close
                        </button>
                        <button 
                          className="btn primary" 
                          onClick={() => {
                            setIsBatchSendModalOpen(false);
                            setActiveTab("outreached");
                            const outreached = safeLeads.filter(l => (l.module || 'Dentist') === activeModule && l.status === 'outreached');
                            if (outreached.length > 0) {
                              setSelectedLeadId(outreached[0].lead_id);
                            }
                          }}
                          style={{padding: '8px 16px', fontSize: '13px', fontWeight: 600}}
                        >
                          View Outreached Leads ({outreachedCount}) →
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
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
