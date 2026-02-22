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
    <div className="border-t bg-white p-4">
      {/* Token Counter */}
      <div className="flex justify-between items-center mb-3 text-xs">
        <span className="text-slate-500">
          {isPremium ? (
            <span className="text-teal-600 font-medium">✨ Chat as much as you like</span>
          ) : (
            <>
              Tokens: <span className={`font-medium ${tokenBalance <= 20 ? 'text-amber-600' : 'text-slate-700'}`}>
                {tokenBalance}
              </span> remaining
            </>
          )}
        </span>
        {!isPremium && tokenBalance <= 20 && (
          <span className="text-amber-600 font-medium">Running low!</span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Tell me about your child and what you're looking for..."
          className="min-h-[60px] max-h-[120px] resize-none"
          disabled={disabled}
        />
        <Button 
          type="submit" 
          disabled={disabled || !message.trim()}
          className="bg-teal-600 hover:bg-teal-700 self-end"
          size="icon"
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