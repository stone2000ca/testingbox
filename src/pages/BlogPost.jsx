import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import Navbar from '@/components/navigation/Navbar';
import Footer from '@/components/navigation/Footer';
import { ArrowLeft, Clock, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';

const articles = {
  1: {
    title: "Best Private Schools in Toronto: A Parent's Guide for 2026",
    author: "NextSchool Team",
    date: "February 15, 2026",
    readTime: 8,
    relatedArticles: [2, 3],
    content: (
      <div className="space-y-8">
        {/* Intro */}
        <section>
          <p className="text-lg text-slate-700 leading-relaxed mb-4">
            Finding the right private school for your child is one of the most important decisions you'll make as a parent. Toronto offers an exceptional range of private schools, each with unique strengths, teaching philosophies, and programs. Whether your child thrives in STEM environments, loves creative pursuits, or needs specialized learning support, there's a school in Toronto designed to help them flourish.
          </p>
          <p className="text-lg text-slate-700 leading-relaxed">
            This guide walks you through Toronto's top private schools, organized by specialty, so you can narrow down your options and find the best fit for your family.
          </p>
        </section>

        {/* How to Use This Guide */}
        <section>
          <h2 className="text-3xl font-bold text-slate-900 mb-4">How to Use This Guide</h2>
          <p className="text-slate-700 leading-relaxed mb-4">
            Below, you'll find schools organized by their signature strengths. Each school description includes key details to help you evaluate fit. We recommend:
          </p>
          <ol className="list-decimal list-inside text-slate-700 space-y-2 ml-4">
            <li>Read the categories that match your child's interests and needs</li>
            <li>Visit each school's website to dive deeper into programs and admissions</li>
            <li>Attend open houses when available to experience the campus culture</li>
            <li>Connect with current families through our consultant to hear their experiences</li>
          </ol>
        </section>

        {/* Best for IB */}
        <section>
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Best for IB Programs</h2>
          <p className="text-slate-700 leading-relaxed mb-6">
            The International Baccalaureate program is known for its rigorous, globally-focused curriculum. Toronto has several outstanding IB schools:
          </p>

          <div className="space-y-6">
            <div className="border-l-4 border-teal-600 pl-6">
              <h3 className="text-xl font-bold text-slate-900 mb-2">Upper Canada College</h3>
              <p className="text-slate-700 mb-2">
                One of Canada's most prestigious independent schools, UCC offers the IB program alongside a traditional curriculum. Known for academic excellence, strong athletic programs, and a vibrant arts culture.
              </p>
              <p className="text-sm text-slate-600"><strong>Grades:</strong> JK–12 | <strong>Setting:</strong> North Toronto campus</p>
            </div>

            <div className="border-l-4 border-teal-600 pl-6">
              <h3 className="text-xl font-bold text-slate-900 mb-2">Toronto French School</h3>
              <p className="text-slate-700 mb-2">
                This IB World School combines French and English immersion with a globally-minded curriculum. Excellent for families wanting bilingual education and international perspective.
              </p>
              <p className="text-sm text-slate-600"><strong>Grades:</strong> K–12 | <strong>Setting:</strong> Downtown Toronto</p>
            </div>

            <div className="border-l-4 border-teal-600 pl-6">
              <h3 className="text-xl font-bold text-slate-900 mb-2">Crescent School</h3>
              <p className="text-slate-700 mb-2">
                An all-boys independent school offering the IB program with a strong emphasis on character development, intellectual curiosity, and leadership.
              </p>
              <p className="text-sm text-slate-600"><strong>Grades:</strong> 3–12 | <strong>Setting:</strong> Midtown Toronto</p>
            </div>
          </div>
        </section>

        {/* Best for Arts */}
        <section>
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Best for Arts</h2>
          <p className="text-slate-700 leading-relaxed mb-6">
            If your child is a creative spirit, these schools prioritize music, visual arts, drama, and creative thinking:
          </p>

          <div className="space-y-6">
            <div className="border-l-4 border-purple-600 pl-6">
              <h3 className="text-xl font-bold text-slate-900 mb-2">Webber Academy</h3>
              <p className="text-slate-700 mb-2">
                Known for its exceptional music program and arts-integrated curriculum. Strong community of young musicians and performers.
              </p>
              <p className="text-sm text-slate-600"><strong>Grades:</strong> JK–12 | <strong>Setting:</strong> Central Toronto</p>
            </div>

            <div className="border-l-4 border-purple-600 pl-6">
              <h3 className="text-xl font-bold text-slate-900 mb-2">Branksome Hall</h3>
              <p className="text-slate-700 mb-2">
                An all-girls independent school with renowned arts programs including drama, visual arts, and music. Known for nurturing confident, creative young women.
              </p>
              <p className="text-sm text-slate-600"><strong>Grades:</strong> 4–12 | <strong>Setting:</strong> Midtown Toronto</p>
            </div>

            <div className="border-l-4 border-purple-600 pl-6">
              <h3 className="text-xl font-bold text-slate-900 mb-2">Avenue Road Arts School</h3>
              <p className="text-slate-700 mb-2">
                A specialized arts school offering an integrated arts curriculum alongside academics. Perfect for students serious about pursuing creative paths.
              </p>
              <p className="text-sm text-slate-600"><strong>Grades:</strong> 6–12 | <strong>Setting:</strong> Uptown Toronto</p>
            </div>
          </div>
        </section>

        {/* Best for STEM */}
        <section>
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Best for STEM</h2>
          <p className="text-slate-700 leading-relaxed mb-6">
            For young scientists, engineers, and tech innovators, these schools excel in science, technology, engineering, and math:
          </p>

          <div className="space-y-6">
            <div className="border-l-4 border-blue-600 pl-6">
              <h3 className="text-xl font-bold text-slate-900 mb-2">St. Andrew's College</h3>
              <p className="text-slate-700 mb-2">
                Offers exceptional science labs and engineering facilities. Known for rigorous STEM curriculum and strong university placements in engineering and science.
              </p>
              <p className="text-sm text-slate-600"><strong>Grades:</strong> 4–12 | <strong>Setting:</strong> North York</p>
            </div>

            <div className="border-l-4 border-blue-600 pl-6">
              <h3 className="text-xl font-bold text-slate-900 mb-2">Havergal College</h3>
              <p className="text-slate-700 mb-2">
                An all-girls school with cutting-edge STEM facilities and programs designed to engage girls in science and technology. Strong mentorship from female leaders in STEM fields.
              </p>
              <p className="text-sm text-slate-600"><strong>Grades:</strong> JK–12 | <strong>Setting:</strong> North Toronto</p>
            </div>

            <div className="border-l-4 border-blue-600 pl-6">
              <h3 className="text-xl font-bold text-slate-900 mb-2">Hillfield Strathallan College</h3>
              <p className="text-slate-700 mb-2">
                Offers maker spaces, robotics labs, and coding programs. Strong focus on hands-on, project-based learning in STEM subjects.
              </p>
              <p className="text-sm text-slate-600"><strong>Grades:</strong> JK–12 | <strong>Setting:</strong> West Toronto</p>
            </div>
          </div>
        </section>

        {/* Best for Learning Support */}
        <section>
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Best for Learning Support</h2>
          <p className="text-slate-700 leading-relaxed mb-6">
            If your child has learning differences or benefits from specialized support, these schools excel in differentiated instruction and inclusive environments:
          </p>

          <div className="space-y-6">
            <div className="border-l-4 border-green-600 pl-6">
              <h3 className="text-xl font-bold text-slate-900 mb-2">The Maples School</h3>
              <p className="text-slate-700 mb-2">
                Specializes in serving students with learning disabilities including dyslexia and ADHD. Small class sizes and specialized instruction.
              </p>
              <p className="text-sm text-slate-600"><strong>Grades:</strong> 1–12 | <strong>Setting:</strong> North Toronto</p>
            </div>

            <div className="border-l-4 border-green-600 pl-6">
              <h3 className="text-xl font-bold text-slate-900 mb-2">Laurier School</h3>
              <p className="text-slate-700 mb-2">
                Serves gifted students and students with learning differences. Low student-teacher ratio with personalized educational plans.
              </p>
              <p className="text-sm text-slate-600"><strong>Grades:</strong> 5–12 | <strong>Setting:</strong> East Toronto</p>
            </div>

            <div className="border-l-4 border-green-600 pl-6">
              <h3 className="text-xl font-bold text-slate-900 mb-2">Trillium School</h3>
              <p className="text-slate-700 mb-2">
                Known for its inclusive, individualized approach. Supports students with diverse learning needs in a nurturing, adaptive environment.
              </p>
              <p className="text-sm text-slate-600"><strong>Grades:</strong> K–12 | <strong>Setting:</strong> Toronto</p>
            </div>
          </div>
        </section>

        {/* Best for Athletics */}
        <section>
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Best for Athletics</h2>
          <p className="text-slate-700 leading-relaxed mb-6">
            For student-athletes, these schools balance rigorous athletics programs with strong academics:
          </p>

          <div className="space-y-6">
            <div className="border-l-4 border-red-600 pl-6">
              <h3 className="text-xl font-bold text-slate-900 mb-2">Ridley College</h3>
              <p className="text-slate-700 mb-2">
                A leading independent school known for exceptional varsity athletic programs and athlete development. Teams compete at the highest levels across multiple sports.
              </p>
              <p className="text-sm text-slate-600"><strong>Grades:</strong> 5–12 | <strong>Setting:</strong> St. Catharines (near Toronto)</p>
            </div>

            <div className="border-l-4 border-red-600 pl-6">
              <h3 className="text-xl font-bold text-slate-900 mb-2">Etobicoke School of the Arts</h3>
              <p className="text-slate-700 mb-2">
                Balances focused athletic programs with academics. Known for student-athletes who excel in both domains and develop strong character.
              </p>
              <p className="text-sm text-slate-600"><strong>Grades:</strong> 7–12 | <strong>Setting:</strong> West Toronto</p>
            </div>

            <div className="border-l-4 border-red-600 pl-6">
              <h3 className="text-xl font-bold text-slate-900 mb-2">Bayview Secondary School</h3>
              <p className="text-slate-700 mb-2">
                Strong athletics culture with excellent facilities and coached varsity programs. Notable for developing elite athletes while maintaining academic standards.
              </p>
              <p className="text-sm text-slate-600"><strong>Grades:</strong> 9–12 | <strong>Setting:</strong> North Toronto</p>
            </div>
          </div>
        </section>

        {/* Mid-Article CTA */}
        <section className="my-12 bg-gradient-to-r from-teal-600 to-teal-700 text-white rounded-lg p-8 md:p-10">
          <h3 className="text-2xl font-bold mb-3">Want Personalized Recommendations?</h3>
          <p className="mb-6 text-teal-50 leading-relaxed">
            Our AI consultant can help you narrow down options based on your child's unique profile. Answer a few questions and get matched with schools that truly fit your family.
          </p>
          <Link to={createPageUrl('Consultant')}>
            <Button className="bg-white text-teal-700 hover:bg-teal-50 font-semibold px-6 py-2">
              Start Your Consultation
            </Button>
          </Link>
        </section>

        {/* What to Consider */}
        <section>
          <h2 className="text-3xl font-bold text-slate-900 mb-4">What to Consider When Choosing a School</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Academic Philosophy</h3>
              <p className="text-slate-700">Does the school's teaching approach align with how your child learns best? (structured vs. flexible, traditional vs. progressive)</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Campus Culture</h3>
              <p className="text-slate-700">Does the school feel like a place where your child would thrive? Visit and observe how students interact and engage.</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Admissions Timeline</h3>
              <p className="text-slate-700">Check application deadlines and requirements. Prepare early for entrance assessments if needed.</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Financial Fit</h3>
              <p className="text-slate-700">Understand tuition costs, financial aid availability, and hidden expenses (uniforms, trips, activities).</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Location & Commute</h3>
              <p className="text-slate-700">Consider travel time and whether the commute is sustainable for your family's daily routine.</p>
            </div>
          </div>
        </section>

        {/* End CTA */}
        <section className="my-12 bg-slate-50 border border-slate-200 rounded-lg p-8 md:p-10">
          <h3 className="text-2xl font-bold text-slate-900 mb-3">Ready to Explore Your Options?</h3>
          <p className="text-slate-700 leading-relaxed mb-6">
            Use our school directory to browse all Toronto schools, compare programs, and create your shortlist. Our AI consultant is here to guide you through the process.
          </p>
          <div className="flex flex-col md:flex-row gap-4">
            <Link to={createPageUrl('SchoolDirectory')}>
              <Button className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2">
                Browse School Directory
              </Button>
            </Link>
            <Link to={createPageUrl('Consultant')}>
              <Button variant="outline" className="px-6 py-2">
                Talk to Our Consultant
              </Button>
            </Link>
          </div>
        </section>
      </div>
    )
  },
  2: {
    title: "School Search Checklist: 10 Questions Every Parent Should Ask",
    author: "NextSchool Team",
    date: "February 8, 2026",
    readTime: 5,
    relatedArticles: [1, 3],
    content: (
      <div className="space-y-8">
        <section>
          <p className="text-lg text-slate-700 leading-relaxed">
            Coming soon. Check back for this comprehensive guide on evaluating schools.
          </p>
        </section>
      </div>
    )
  },
  3: {
    title: "Understanding IB Programs: What Parents Need to Know",
    author: "NextSchool Team",
    date: "January 30, 2026",
    readTime: 7,
    relatedArticles: [1, 2],
    content: (
      <div className="space-y-8">
        <section>
          <p className="text-lg text-slate-700 leading-relaxed">
            Coming soon. Check back for this detailed overview of the International Baccalaureate program.
          </p>
        </section>
      </div>
    )
  }
};

export default function BlogPost() {
  const [articleId, setArticleId] = useState(1);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = parseInt(params.get('id')) || 1;
    setArticleId(id);
  }, []);

  const article = articles[articleId] || articles[1];
  const relatedArticlesList = articles[1].relatedArticles
    .map(id => ({ id, ...articles[id] }))
    .slice(0, 2);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Header Banner */}
      <section className="bg-gradient-to-br from-slate-900 to-slate-800 py-16 text-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <Link to={createPageUrl('Blog')} className="inline-flex items-center gap-2 text-slate-300 hover:text-white transition-colors mb-6">
            <ArrowLeft className="w-4 h-4" />
            Back to Guides
          </Link>
          <h1 className="text-4xl md:text-5xl font-bold mb-6">{article.title}</h1>
          <div className="flex flex-col md:flex-row md:items-center gap-4 text-slate-300 text-sm">
            <span>By {article.author}</span>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {article.date}
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {article.readTime} min read
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Article Content */}
      <section className="py-16">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 prose prose-lg prose-slate max-w-none">
          <div className="text-slate-700 leading-relaxed">
            {article.content}
          </div>
        </div>
      </section>

      {/* Related Articles */}
      <section className="py-16 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900 mb-12">Related Guides</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {relatedArticlesList.map((relArticle) => (
              <Link
                key={relArticle.id}
                to={relArticle.id === 1 ? createPageUrl('BlogPost') + '?id=1' : createPageUrl('BlogPost') + '?id=' + relArticle.id}
                className="group"
              >
                <div className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  <div
                    style={{ backgroundImage: relArticle.image }}
                    className="w-full h-40"
                  />
                  <div className="p-6">
                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-teal-600 transition-colors mb-2">
                      {relArticle.title}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-slate-500">
                      <span>{relArticle.date}</span>
                      <span>{relArticle.readTime} min</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}