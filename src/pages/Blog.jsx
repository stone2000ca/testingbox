import { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import Navbar from '@/components/navigation/Navbar';
import Footer from '@/components/navigation/Footer';
import { ArrowRight, Clock, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Blog() {
  const [hoveredCard, setHoveredCard] = useState(null);

  const articles = [
    {
      id: 1,
      title: "Best Private Schools in Toronto: A Parent's Guide for 2026",
      excerpt: "Discover top-rated private schools in Toronto with our comprehensive guide covering IB, arts, STEM, learning support, and athletics programs.",
      date: 'February 15, 2026',
      readTime: 8,
      image: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      path: createPageUrl('BlogPost') + '?id=1'
    },
    {
      id: 2,
      title: "School Search Checklist: 10 Questions Every Parent Should Ask",
      excerpt: "A practical checklist to help you evaluate schools and ensure you're choosing the right fit for your child's education and growth.",
      date: 'February 8, 2026',
      readTime: 5,
      image: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      path: createPageUrl('BlogPost') + '?id=2'
    },
    {
      id: 3,
      title: "Understanding IB Programs: What Parents Need to Know",
      excerpt: "A complete overview of the International Baccalaureate curriculum, its benefits, and how to determine if it's right for your family.",
      date: 'January 30, 2026',
      readTime: 7,
      image: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      path: createPageUrl('BlogPost') + '?id=3'
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Header Banner */}
      <section className="bg-gradient-to-br from-slate-900 to-slate-800 py-16 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-5xl font-bold mb-4">NextSchool Guides</h1>
          <p className="text-slate-300 text-lg">Expert resources to help you find the perfect school for your child</p>
        </div>
      </section>

      {/* Articles Grid */}
      <section className="py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {articles.map((article) => (
              <Link
                key={article.id}
                to={article.path}
                className="group cursor-pointer"
                onMouseEnter={() => setHoveredCard(article.id)}
                onMouseLeave={() => setHoveredCard(null)}
              >
                <div className="h-64 rounded-lg overflow-hidden mb-5 shadow-lg transition-transform duration-300 transform group-hover:scale-105">
                  <div
                    style={{ backgroundImage: article.image }}
                    className="w-full h-full"
                  />
                </div>

                <div className="space-y-3">
                  <h3 className="text-2xl font-bold text-slate-900 group-hover:text-teal-600 transition-colors">
                    {article.title}
                  </h3>

                  <p className="text-slate-600 leading-relaxed">
                    {article.excerpt}
                  </p>

                  <div className="flex items-center gap-6 text-sm text-slate-500 pt-2">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {article.date}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {article.readTime} min read
                    </div>
                  </div>

                  <div className="pt-4 flex items-center gap-2 text-teal-600 font-semibold group-hover:gap-3 transition-all">
                    Read More
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Bottom CTA */}
          <div className="mt-20 bg-gradient-to-r from-teal-50 to-blue-50 rounded-lg p-12 border border-teal-200">
            <div className="text-center space-y-4">
              <h3 className="text-3xl font-bold text-slate-900">
                Ready to Find Your Perfect School?
              </h3>
              <p className="text-slate-600 max-w-2xl mx-auto">
                Let our AI consultant help you explore schools that match your child's unique needs and your family's priorities.
              </p>
              <Link to={createPageUrl('Consultant')}>
                <Button className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-6 text-lg gap-2">
                  Start Your School Search
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}