import ReactMarkdown from 'react-markdown';

export default function MessageBubble({ message, isUser, onViewSchoolProfile, schools }) {
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
                   const childText = typeof children === 'string' ? children : 
                     Array.isArray(children) ? children.map(c => typeof c === 'string' ? c : '').join('') : '';
                   
                   console.log('🔗 MessageBubble link clicked:', { childText, href, schoolsAvailable: schools?.length });
                   
                   // Check if href is a school link (format: school:slug)
                   const isSchoolLink = href && href.startsWith('school:');
                   const slugFromHref = isSchoolLink ? href.replace('school:', '') : null;
                   
                   // Try to find matching school by name (case-insensitive exact match)
                   const matchingSchool = schools?.find(s => 
                     s.name && childText && s.name.toLowerCase().trim() === childText.toLowerCase().trim()
                   );
                   
                   console.log('🎯 Link analysis:', { isSchoolLink, slugFromHref, matchingSchool: matchingSchool?.name || 'not found' });
                   
                   // BULLETPROOF: Always return a button, never a regular <a> tag
                   // Prevents default navigation in all cases
                   return (
                     <button
                       onClick={(e) => {
                         e.preventDefault();
                         e.stopPropagation();
                         
                         // If it's a school link or matches a school name, call onViewSchoolProfile
                         if (isSchoolLink || matchingSchool) {
                           const slug = slugFromHref || matchingSchool?.slug;
                           console.log('✅ Calling onViewSchoolProfile with slug:', slug);
                           onViewSchoolProfile && onViewSchoolProfile(slug);
                         } else if (href) {
                           // Otherwise, open the link in a new tab
                           console.log('🌐 Opening external link:', href);
                           window.open(href, '_blank');
                         }
                       }}
                       className="text-teal-600 hover:underline cursor-pointer font-semibold inline bg-transparent border-none p-0"
                     >
                       {children}
                     </button>
                   );
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