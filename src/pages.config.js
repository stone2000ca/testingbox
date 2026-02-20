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
import Admin from './pages/Admin';
import ClaimSchool from './pages/ClaimSchool';
import Consultant from './pages/Consultant';
import Home from './pages/Home';
import ParentDashboard from './pages/ParentDashboard';
import Pricing from './pages/Pricing';
import SchoolAdmin from './pages/SchoolAdmin';
import SchoolDirectory from './pages/SchoolDirectory';
import SchoolProfile from './pages/SchoolProfile';
import SchoolAdminDashboard from './pages/SchoolAdminDashboard';
import HowItWorks from './pages/HowItWorks';
import About from './pages/About';


export const PAGES = {
    "Admin": Admin,
    "ClaimSchool": ClaimSchool,
    "Consultant": Consultant,
    "Home": Home,
    "ParentDashboard": ParentDashboard,
    "Pricing": Pricing,
    "SchoolAdmin": SchoolAdmin,
    "SchoolDirectory": SchoolDirectory,
    "SchoolProfile": SchoolProfile,
    "SchoolAdminDashboard": SchoolAdminDashboard,
    "HowItWorks": HowItWorks,
    "About": About,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
};