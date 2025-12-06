import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Message, Sender, SelectionData } from '../types';
import { generateAIResponse } from '../services/grokService';
import { Icons } from './ui/Icons';
import { useLanguage } from '../contexts/LanguageContext';

interface ChatWidgetProps {
  selection: SelectionData | null;
  onClearSelection: () => void;
  isPro: boolean;
  onUpgrade: () => void;
  onOpenChange?: (isOpen: boolean) => void; // Callback when chat open state changes
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({ selection, onClearSelection, isPro, onUpgrade, onOpenChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Notify parent when isOpen changes
  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);
  const { t, language } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize welcome message when component mounts or language changes
  useEffect(() => {
    setMessages(prev => {
        if (prev.length === 0) {
            return [{
                id: 'welcome',
                text: t('chat_welcome'),
                sender: Sender.Model,
                timestamp: Date.now(),
            }];
        }
        return prev;
    });
  }, [t]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !isPro) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: inputValue,
      sender: Sender.User,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      const responseText = await generateAIResponse(userMsg.text, selection, language);
      
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: responseText,
        sender: Sender.Model,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (error) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: "Sorry, I encountered an error connecting to the AI. Please try again.",
        sender: Sender.Model,
        timestamp: Date.now(),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenWidget = () => {
      setIsOpen(!isOpen);
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={handleOpenWidget}
        className={`fixed bottom-6 right-6 z-50 p-4 rounded-full shadow-xl transition-all duration-300 transform hover:scale-105 active:scale-95 ${
          isOpen 
            ? 'bg-gray-800 text-white rotate-90' 
            : selection 
              ? 'bg-indigo-600 text-white animate-pulse' // Highlight if context available
              : 'bg-white text-gray-800'
        }`}
        aria-label="Toggle AI Assistant"
      >
        {isOpen ? <Icons.Close size={24} /> : <Icons.Sparkles size={24} />}
        {selection && !isOpen && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-indigo-500 border-2 border-white"></span>
            </span>
        )}
      </button>

      {/* Chat Interface / Drawer */}
      <div
        className={`fixed inset-y-0 right-0 z-40 w-full sm:w-96 bg-white/95 backdrop-blur-md shadow-2xl transform transition-transform duration-300 ease-in-out border-l border-gray-100 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full relative">
          
          {/* Pro Gate Overlay (if not pro) */}
          {!isPro && (
             <div className="absolute inset-0 z-50 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                 <div className="bg-white p-6 rounded-2xl shadow-xl border border-indigo-100 max-w-sm w-full">
                     <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
                        <Icons.Crown className="text-white" size={28} />
                     </div>
                     <h3 className="text-xl font-bold text-gray-900 mb-2">{t('unlock_ai')}</h3>
                     <p className="text-gray-500 text-sm mb-6">
                        {t('upgrade_msg')}
                     </p>
                     
                     <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 p-2 rounded-lg">
                            <Icons.Check size={16} className="text-green-500 shrink-0" />
                            <span>{t('ask_questions')}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 p-2 rounded-lg">
                            <Icons.Check size={16} className="text-green-500 shrink-0" />
                            <span>{t('instant_translations')}</span>
                        </div>
                     </div>

                     <button 
                        onClick={() => {
                            setIsOpen(false);
                            onUpgrade();
                        }}
                        className="w-full mt-6 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                     >
                        {t('upgrade_btn')} <Icons.ArrowRight size={18} />
                     </button>
                 </div>
             </div>
          )}

          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white/80">
            <div className="flex items-center gap-2 text-indigo-700 font-semibold">
              <Icons.Sparkles size={18} />
              <span>{t('ai_companion')}</span>
              {isPro && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold">PRO</span>}
            </div>
            <button 
                onClick={() => setIsOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
            >
                <Icons.Close size={20} />
            </button>
          </div>

          {/* Messages Area */}
          <div className={`flex-1 overflow-y-auto p-4 space-y-4 bg-stone-50 ${!isPro ? 'opacity-30 pointer-events-none' : ''}`}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${
                  msg.sender === Sender.User ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                    msg.sender === Sender.User
                      ? 'bg-indigo-600 text-white rounded-br-none'
                      : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none'
                  } ${msg.isError ? 'bg-red-50 text-red-600 border-red-100' : ''}`}
                >
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Context Preview (if text selected) */}
          {selection && isPro && (
            <div className="px-4 py-2 bg-indigo-50 border-t border-indigo-100 flex items-start justify-between">
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-indigo-600 mb-1 flex items-center gap-1">
                        <Icons.Book size={12} /> {t('selected_context')}
                    </p>
                    <p className="text-sm text-gray-600 truncate italic">"{selection.text}"</p>
                </div>
                <button 
                    onClick={onClearSelection}
                    className="ml-2 p-1.5 text-indigo-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                    title={t('clear')}
                >
                    <Icons.Clear size={16} />
                </button>
            </div>
          )}

          {/* Input Area */}
          <div className={`p-4 bg-white border-t border-gray-100 ${!isPro ? 'opacity-30 pointer-events-none' : ''}`}>
            <div className="flex items-center gap-2 bg-gray-50 rounded-full px-4 py-2 border border-gray-200 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder={selection ? t('placeholder_select') : t('placeholder_ask')}
                className="flex-1 bg-transparent border-none outline-none text-gray-700 placeholder-gray-400 text-sm"
                disabled={isLoading || !isPro}
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isLoading || !isPro}
                className="p-1.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Icons.Send size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};