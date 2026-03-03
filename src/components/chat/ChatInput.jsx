import { useState, forwardRef, useImperativeHandle, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2 } from "lucide-react";

const ChatInput = forwardRef(({ onSend, disabled, tokenBalance, isPremium }, ref) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      textareaRef.current?.focus();
    }
  }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim()) {
      onSend(message);
      setMessage('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="border-t p-3 sm:p-4" style={{ background: '#1a3a3a' }}>
      {/* Token Counter */}
      <div className="flex justify-between items-center mb-2 text-xs">
        <span className="text-white/50">
          {isPremium ? (
            <span className="text-teal-300 font-medium">✨ Chat as much as you like</span>
          ) : (
            <>
              Tokens: <span className={`font-medium ${tokenBalance <= 20 ? 'text-amber-400' : 'text-white/70'}`}>
                {tokenBalance}
              </span> remaining
            </>
          )}
        </span>
        {!isPremium && tokenBalance <= 20 && (
          <span className="text-amber-400 font-medium">Running low!</span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 items-stretch">
         <Textarea
           ref={textareaRef}
           value={message}
           onChange={(e) => setMessage(e.target.value)}
           onKeyDown={handleKeyDown}
           placeholder="Tell me about your child and what you're looking for..."
           className="min-h-[44px] max-h-[120px] resize-none bg-teal-900/40 border-teal-700/50 text-white placeholder:text-white/50 focus:border-teal-400 focus:ring-teal-400"
           disabled={disabled}
         />
        <Button 
          type="submit" 
          disabled={disabled || !message.trim()}
          className="bg-teal-600 hover:bg-teal-700 self-stretch px-3"
        >
          {disabled ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  );
});

ChatInput.displayName = 'ChatInput';

export default ChatInput;