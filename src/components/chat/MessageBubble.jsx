import ReactMarkdown from 'react-markdown';

export default function MessageBubble({ message, isUser, onViewSchoolProfile }) {
  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="h-8 w-8 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
          <span className="text-teal-600 text-sm font-semibold">AI</span>
        </div>
      )}
      <div className={`max-w-[85%] ${isUser && 'flex flex-col items-end'}`}>
        <div className={`rounded-2xl px-4 py-3 ${
          isUser 
            ? 'bg-teal-600 text-white' 
            : 'bg-white border border-slate-200 text-slate-900'
        }`}>
          {isUser ? (
            <p className="text-sm leading-relaxed">{message.content}</p>
          ) : (
            <ReactMarkdown 
              className="text-sm prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
              components={{
                p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
                ul: ({ children }) => <ul className="my-1 ml-4 list-disc">{children}</ul>,
                ol: ({ children }) => <ol className="my-1 ml-4 list-decimal">{children}</ol>,
                li: ({ children }) => <li className="my-0.5">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-teal-700">{children}</strong>,
                a: ({ href, children }) => {
                  if (onViewSchoolProfile && href?.startsWith('school:')) {
                    const slug = href.replace('school:', '');
                    return (
                      <button
                        onClick={() => onViewSchoolProfile(slug)}
                        className="text-teal-600 hover:underline cursor-pointer font-semibold"
                      >
                        {children}
                      </button>
                    );
                  }
                  return <a href={href} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">{children}</a>;
                }
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
        </div>
        {message.timestamp && (
          <span className="text-xs text-slate-400 mt-1 px-1">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  );
}