import ReactMarkdown from 'react-markdown';

export default function MessageBubble({ message, isUser, onViewSchoolProfile, schools, consultantName }) {
  const accentColor = consultantName === 'Jackie' ? '#C27B8A' : '#6B9DAD';
  
  return (
    <div className={`flex gap-2 sm:gap-3 ${isUser ? 'justify-end' : 'justify-start'} ${!isUser ? 'animate-fadeIn' : ''}`}>
      {!isUser && (
        <div className="h-8 sm:h-10 w-8 sm:w-10 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-sm" style={{ backgroundColor: accentColor }} aria-hidden="true">
          {consultantName === 'Jackie' ? 'J' : 'L'}
        </div>
      )}
      <div className={`max-w-[85%] ${isUser && 'flex flex-col items-end'}`}>
        <div className={`rounded-2xl px-3 sm:px-4 py-2 sm:py-3 ${
          isUser 
            ? 'bg-[#f1f5f9] text-slate-900' 
            : 'bg-[#334155] text-white'
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
                strong: ({ children }) => <strong className="font-semibold" style={{ color: accentColor }}>{children}</strong>,
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
                       className="hover:underline cursor-pointer font-semibold inline bg-transparent border-none p-0"
                       style={{ color: accentColor }}
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
                   <span className={`text-[10px] sm:text-xs mt-1 px-1 ${isUser ? 'text-slate-500' : 'text-white/40'}`}>
                     {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                   </span>
                   )}
      </div>
    </div>
  );
}