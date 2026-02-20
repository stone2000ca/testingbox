import ReactMarkdown from 'react-markdown';

// Helper function to process raw markdown links in text
function processMarkdownLinks(children, onViewSchoolProfile) {
  if (!children || !onViewSchoolProfile) return children;
  
  const processNode = (node) => {
    if (typeof node === 'string') {
      // Find all markdown links: [text](school:slug)
      const parts = [];
      let lastIndex = 0;
      const regex = /\[([^\]]+)\]\(school:([^)]+)\)/g;
      let match;
      
      while ((match = regex.exec(node)) !== null) {
        // Add text before the link
        if (match.index > lastIndex) {
          parts.push(node.substring(lastIndex, match.index));
        }
        
        // Add the clickable link
        const [_, schoolName, slug] = match;
        parts.push(
          <button
            key={match.index}
            onClick={() => onViewSchoolProfile(slug)}
            className="text-teal-600 hover:underline cursor-pointer font-semibold"
          >
            {schoolName}
          </button>
        );
        
        lastIndex = match.index + match[0].length;
      }
      
      // Add remaining text
      if (lastIndex < node.length) {
        parts.push(node.substring(lastIndex));
      }
      
      return parts.length > 0 ? parts : node;
    }
    
    if (Array.isArray(node)) {
      return node.map((child, idx) => <span key={idx}>{processNode(child)}</span>);
    }
    
    return node;
  };
  
  return processNode(children);
}

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
                p: ({ children }) => {
                  // Process children to convert raw markdown links
                  const processedChildren = processMarkdownLinks(children, onViewSchoolProfile);
                  return <p className="my-1 leading-relaxed">{processedChildren}</p>;
                },
                ul: ({ children }) => <ul className="my-1 ml-4 list-disc">{children}</ul>,
                ol: ({ children }) => <ol className="my-1 ml-4 list-decimal">{children}</ol>,
                li: ({ children }) => {
                  // Process children to convert raw markdown links in list items
                  const processedChildren = processMarkdownLinks(children, onViewSchoolProfile);
                  return <li className="my-0.5">{processedChildren}</li>;
                },
                strong: ({ children }) => <strong className="font-semibold text-teal-700">{children}</strong>,
                a: ({ href, children }) => {
                  // FIX #2: Handle school:slug links consistently
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