/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import About from './pages/About';
import Admin from './pages/Admin';
import AdminFeedback from './pages/AdminFeedback';
import BlogPost from './pages/BlogPost';
import ClaimSchool from './pages/ClaimSchool';
import Consultant from './pages/Consultant';
import Contact from './pages/Contact';
import Dashboard from './pages/Dashboard';
import Feedback from './pages/Feedback';
import ForSchools from './pages/ForSchools';
import Guides from './pages/Guides';
import Home from './pages/Home';
import HowItWorks from './pages/HowItWorks';
import ParentDashboard from './pages/ParentDashboard';
import Portal from './pages/Portal';
import Pricing from './pages/Pricing';
import Privacy from './pages/Privacy';
import SchoolAdmin from './pages/SchoolAdmin';
import SchoolDirectory from './pages/SchoolDirectory';
import SchoolProfile from './pages/SchoolProfile';
import SharedProfile from './pages/SharedProfile';
import SharedShortlistView from './pages/SharedShortlistView';
import SubmitSchool from './pages/SubmitSchool';
import Terms from './pages/Terms';
import stateMachineConfig from './pages/stateMachineConfig';
import __Layout from './Layout.jsx';


export const PAGES = {
    "About": About,
    "Admin": Admin,
    "AdminFeedback": AdminFeedback,
    "BlogPost": BlogPost,
    "ClaimSchool": ClaimSchool,
    "Consultant": Consultant,
    "Contact": Contact,
    "Dashboard": Dashboard,
    "Feedback": Feedback,
    "ForSchools": ForSchools,
    "Guides": Guides,
    "Home": Home,
    "HowItWorks": HowItWorks,
    "ParentDashboard": ParentDashboard,
    "Portal": Portal,
    "Pricing": Pricing,
    "Privacy": Privacy,
    "SchoolAdmin": SchoolAdmin,
    "SchoolDirectory": SchoolDirectory,
    "SchoolProfile": SchoolProfile,
    "SharedProfile": SharedProfile,
    "SharedShortlistView": SharedShortlistView,
    "SubmitSchool": SubmitSchool,
    "Terms": Terms,
    "stateMachineConfig": stateMachineConfig,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};