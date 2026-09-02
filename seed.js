require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");
const Service = require("./models/Service");
const Product = require("./models/Product");
const Course = require("./models/Course");

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/qurux_makeover";

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const reset = process.argv.includes("--reset");
    if (reset) {
      console.log("⚠️  Resetting all data...");
      await User.deleteMany({});
      await Service.deleteMany({});
      await Product.deleteMany({});
      await Course.deleteMany({});
    }

    // ── Admin User ──
    const adminEmail = process.env.ADMIN_EMAIL || "admin@qurux.com";
    let admin = await User.findOne({ email: adminEmail });
    if (!admin) {
      admin = await User.create({
        fullName: "Qurux Admin",
        email: adminEmail,
        mobile: "9999999999",
        password: process.env.ADMIN_PASSWORD || "admin123",
        role: "ADMIN",
        status: "APPROVED",
      });
      console.log(`✅ Admin created: ${adminEmail} / ${process.env.ADMIN_PASSWORD || "admin123"}`);
    } else {
      console.log(`ℹ️  Admin already exists: ${adminEmail}`);
    }

    // ── Demo Customer ──
    let demoUser = await User.findOne({ email: "demo@qurux.com" });
    if (!demoUser) {
      demoUser = await User.create({
        fullName: "Demo Customer",
        email: "demo@qurux.com",
        mobile: "9876543210",
        password: "demo1234",
        role: "CUSTOMER",
        status: "APPROVED",
      });
      console.log("✅ Demo customer created: demo@qurux.com / demo1234");
    }

    // ── Services ──
    const servicesCount = await Service.countDocuments();
    if (servicesCount === 0) {
      const services = [
        // Bridal Makeup
        { name: "Classic Bridal Makeup", slug: "classic-bridal-makeup", category: "Bridal Makeup", price: 15000, duration: "3-4 hours", description: "Traditional bridal look with elegant makeup application", includes: ["Face makeup", "Eye makeup", "Lip color", "Setting spray", "Hair styling basic"] },
        { name: "HD Bridal Makeup", slug: "hd-bridal-makeup", category: "Bridal Makeup", price: 25000, duration: "3-4 hours", description: "High-definition camera-ready bridal makeup", includes: ["HD foundation", "Contouring", "Eye makeup", "Lip color", "Hair styling", "Setting spray"] },
        { name: "Airbrush Bridal Makeup", slug: "airbrush-bridal-makeup", category: "Bridal Makeup", price: 35000, duration: "4-5 hours", description: "Flawless airbrush finish for the perfect bridal glow", includes: ["Airbrush foundation", "Contouring", "Highlighting", "Eye makeup", "Lip color", "Hair styling", "Draping assistance"] },
        { name: "Luxury Bridal Makeup", slug: "luxury-bridal-makeup", category: "Bridal Makeup", price: 50000, duration: "5-6 hours", description: "Premium bridal experience with luxury products and complete styling", includes: ["Premium airbrush makeup", "Complete eye look", "Hair styling", "Draping", "Nail touch-up", "Touch-up kit", "Personal artist for event"] },

        // Pre Bridal
        { name: "Pre Bridal Facial", slug: "pre-bridal-facial", category: "Pre Bridal Makeup", price: 2000, duration: "60 min", description: "Pre-bridal glow facial for radiant skin" },
        { name: "Pre Bridal Cleanup", slug: "pre-bridal-cleanup", category: "Pre Bridal Makeup", price: 1500, duration: "45 min", description: "Deep cleansing cleanup for clear skin" },
        { name: "Pre Bridal Manicure", slug: "pre-bridal-manicure", category: "Pre Bridal Makeup", price: 1200, duration: "45 min", description: "Bridal manicure for beautiful hands" },
        { name: "Pre Bridal Pedicure", slug: "pre-bridal-pedicure", category: "Pre Bridal Makeup", price: 1200, duration: "45 min", description: "Bridal pedicure for pampered feet" },
        { name: "Pre Bridal Hair Spa", slug: "pre-bridal-hair-spa", category: "Pre Bridal Makeup", price: 2500, duration: "60 min", description: "Hair spa treatment for smooth, shiny bridal hair" },

        // Party Makeup
        { name: "Party Makeup", slug: "party-makeup", category: "Party Makeup", price: 3500, duration: "60-90 min", description: "Glamorous party look for special occasions", includes: ["Full face makeup", "Eye look", "Lip color", "Hair styling basic"] },

        // Engagement Makeup
        { name: "Engagement Makeup", slug: "engagement-makeup", category: "Engagement Makeup", price: 8000, duration: "2-3 hours", description: "Elegant engagement day look", includes: ["HD makeup", "Eye makeup", "Hair styling", "Draping assistance"] },

        // Facials
        { name: "Korean Glass Facial", slug: "korean-glass-facial", category: "Facial", price: 2500, duration: "60 min", description: "Korean glass skin facial for dewy radiant glow" },
        { name: "Gold Facial", slug: "gold-facial", category: "Facial", price: 2000, duration: "60 min", description: "Luxurious gold facial for anti-aging and glow" },
        { name: "Fruit Facial", slug: "fruit-facial", category: "Facial", price: 1500, duration: "45 min", description: "Natural fruit facial for fresh, healthy skin" },
        { name: "HydraGlo Facial", slug: "hydraglo-facial", category: "Facial", price: 3000, duration: "75 min", description: "Deep hydration facial for dry and dull skin" },
        { name: "Anti-Ageing Facial", slug: "anti-ageing-facial", category: "Facial", price: 3500, duration: "75 min", description: "Advanced anti-aging treatment to reduce fine lines" },
        { name: "LED Therapy Facial", slug: "led-therapy-facial", category: "Facial", price: 4000, duration: "60 min", description: "LED light therapy facial for skin rejuvenation" },

        // Skin Care
        { name: "De-Tan Treatment", slug: "de-tan-treatment", category: "Skin Care", price: 1800, duration: "60 min", description: "Full body or face de-tan treatment" },
        { name: "Skin Brightening Mask", slug: "skin-brightening-mask", category: "Skin Care", price: 1200, duration: "30 min", description: "Instant brightening face mask" },
        { name: "Bleach Treatment", slug: "bleach-treatment", category: "Skin Care", price: 800, duration: "20 min", description: "Gentle bleach treatment for facial hair lightening" },

        // Manicure
        { name: "Classic Manicure", slug: "classic-manicure", category: "Manicure", price: 800, duration: "30 min", description: "Basic manicure for clean, groomed nails" },
        { name: "Spa Manicure", slug: "spa-manicure", category: "Manicure", price: 1500, duration: "45 min", description: "Relaxing spa manicure with massage and mask" },
        { name: "Korean Manicure", slug: "korean-manicure", category: "Manicure", price: 2000, duration: "60 min", description: "Korean-style jelly nail manicure" },

        // Pedicure
        { name: "Classic Pedicure", slug: "classic-pedicure", category: "Pedicure", price: 1000, duration: "40 min", description: "Basic pedicure for clean feet" },
        { name: "Spa Pedicure", slug: "spa-pedicure", category: "Pedicure", price: 1800, duration: "60 min", description: "Full spa pedicure with scrub, mask, and massage" },

        // Hair Styling
        { name: "Hair Styling - Blow Dry", slug: "hair-styling-blow-dry", category: "Hair Styling", price: 1000, duration: "30 min", description: "Professional blow dry styling" },
        { name: "Hair Styling - Hair Spa", slug: "hair-styling-spa", category: "Hair Styling", price: 2000, duration: "60 min", description: "Deep conditioning hair spa treatment" },
        { name: "Hair Styling - Straightening", slug: "hair-styling-straightening", category: "Hair Styling", price: 3500, duration: "90 min", description: "Professional hair straightening" },
        { name: "Hair Styling - Curling", slug: "hair-styling-curling", category: "Hair Styling", price: 2500, duration: "60 min", description: "Beautiful curls for any occasion" },
        { name: "Hair Styling - Updo", slug: "hair-styling-updo", category: "Hair Styling", price: 2000, duration: "45 min", description: "Elegant updo for events and parties" },

        // Other
        { name: "Threading - Eyebrows", slug: "threading-eyebrows", category: "Other Salon Services", price: 100, duration: "10 min", description: "Precision eyebrow threading" },
        { name: "Threading - Upper Lip", slug: "threading-upper-lip", category: "Other Salon Services", price: 50, duration: "5 min", description: "Upper lip threading" },
        { name: "Full Body Wax", slug: "full-body-wax", category: "Other Salon Services", price: 3000, duration: "90 min", description: "Full body waxing with premium wax" },
        { name: "Face Wax", slug: "face-wax", category: "Other Salon Services", price: 500, duration: "20 min", description: "Face waxing for smooth skin" },
        { name: "Body Polishing", slug: "body-polishing", category: "Other Salon Services", price: 4000, duration: "90 min", description: "Full body polishing for radiant skin" },
      ];

      await Service.insertMany(services);
      console.log(`✅ ${services.length} services seeded`);
    } else {
      console.log(`ℹ️  ${servicesCount} services already exist`);
    }

    // ── Products (ESSN Cosmetics) ──
    const productsCount = await Product.countDocuments();
    if (productsCount === 0) {
      const products = [
        { name: "ESSN Foundation Matte", slug: "essn-foundation-matte", category: "Face", price: 1299, mrp: 1599, stock: 50, description: "Long-lasting matte foundation for all-day wear", brand: "ESSN" },
        { name: "ESSN Concealer Stick", slug: "essn-concealer-stick", category: "Face", price: 899, mrp: 1099, stock: 40, description: "Full coverage concealer stick", brand: "ESSN" },
        { name: "ESSN Compact Powder", slug: "essn-compact-powder", category: "Face", price: 799, mrp: 999, stock: 60, description: "Silky smooth compact for setting makeup", brand: "ESSN" },
        { name: "ESSN Blush Palette", slug: "essn-blush-palette", category: "Face", price: 1199, mrp: 1499, stock: 35, description: "6-shade blush palette for natural flush", brand: "ESSN" },
        { name: "ESSN Eyeshadow Palette - Nude", slug: "essn-eyeshadow-nude", category: "Eyes", price: 1499, mrp: 1999, stock: 30, description: "12-shade nude eyeshadow palette", brand: "ESSN" },
        { name: "ESSN Kajal Intense Black", slug: "essn-kajal-black", category: "Eyes", price: 399, mrp: 499, stock: 80, description: "Intense black waterproof kajal", brand: "ESSN" },
        { name: "ESSN Mascara Volume", slug: "essn-mascara-volume", category: "Eyes", price: 699, mrp: 899, stock: 45, description: "Volumizing mascara for dramatic lashes", brand: "ESSN" },
        { name: "ESSN Lipstick - Ruby Red", slug: "essn-lipstick-ruby", category: "Lips", price: 599, mrp: 799, stock: 50, description: "Long-lasting matte lipstick in ruby red", brand: "ESSN" },
        { name: "ESSN Lip Gloss Shimmer", slug: "essn-lip-gloss", category: "Lips", price: 499, mrp: 699, stock: 40, description: "Shimmer lip gloss for glossy finish", brand: "ESSN" },
        { name: "ESSN Lip Liner Set", slug: "essn-lip-liner-set", category: "Lips", price: 699, mrp: 899, stock: 30, description: "Set of 4 lip liner pencils", brand: "ESSN" },
        { name: "ESSN Setting Spray", slug: "essn-setting-spray", category: "Tools", price: 899, mrp: 1199, stock: 35, description: "Makeup setting spray for long-lasting wear", brand: "ESSN" },
        { name: "ESSN Makeup Brush Set", slug: "essn-brush-set", category: "Tools", price: 2499, mrp: 3499, stock: 20, description: "Professional 12-piece makeup brush set", brand: "ESSN" },
        { name: "ESSN Primer smoothing", slug: "essn-primer-smoothing", category: "Face", price: 999, mrp: 1299, stock: 45, description: "Pore-minimizing smoothing primer", brand: "ESSN" },
        { name: "ESSN Highlighter Duo", slug: "essn-highlighter-duo", category: "Face", price: 1099, mrp: 1399, stock: 25, description: "Dual shade highlighter for glowing skin", brand: "ESSN" },
        { name: "ESSN Eyebrow Pencil", slug: "essn-eyebrow-pencil", category: "Eyes", price: 449, mrp: 599, stock: 55, description: "Precision tip eyebrow pencil with spoolie", brand: "ESSN" },
      ];

      await Product.insertMany(products);
      console.log(`✅ ${products.length} ESSN products seeded`);
    } else {
      console.log(`ℹ️  ${productsCount} products already exist`);
    }

    // ── Courses (Academy) ──
    const coursesCount = await Course.countDocuments();
    if (coursesCount === 0) {
      const courses = [
        { title: "Basic Makeup Course", slug: "basic-makeup-course", duration: "1 Month", hours: "40 hours", level: "BEGINNER", fee: 15000, description: "Learn fundamentals of makeup artistry — face shapes, skin prep, foundation matching, eye looks, lip techniques.", topics: ["Skin types & prep", "Foundation matching", "Basic eye looks", "Lip techniques", "Contouring basics", "Practice sessions"] },
        { title: "Professional Makeup Course", slug: "professional-makeup-course", duration: "3 Months", hours: "120 hours", level: "PROFESSIONAL", fee: 45000, description: "Advanced makeup techniques for aspiring professionals — bridal, editorial, fashion, and special effects.", topics: ["Advanced contouring", "Bridal makeup", "Editorial looks", "Fashion makeup", "Color theory", "Client management", "Portfolio building"] },
        { title: "Advanced Bridal & Airbrush Course", slug: "advanced-bridal-airbrush", duration: "2 Months", hours: "80 hours", level: "ADVANCED", fee: 65000, description: "Master airbrush technique and luxury bridal styling for high-end clientele.", topics: ["Airbrush mastery", "Luxury bridal looks", "HD & camera-ready makeup", "Hair styling for brides", "Draping & styling", "Business of bridal makeup"] },
        { title: "Skin Care & Facial Course", slug: "skin-care-facial-course", duration: "1 Month", hours: "40 hours", level: "BEGINNER", fee: 12000, description: "Comprehensive skin care course — facials, treatments, product knowledge, and client skin analysis.", topics: ["Skin analysis", "Facial techniques", "Product knowledge", "LED & advanced facials", "De-tan treatments", "Client consultation"] },
        { title: "Hair Styling & Management", slug: "hair-styling-management", duration: "2 Months", hours: "80 hours", level: "PROFESSIONAL", fee: 35000, description: "Professional hair styling — blow dry, updos, bridal hair, straightening, and curling techniques.", topics: ["Blow dry mastery", "Bridal updos", "Straightening & curling", "Hair spa treatments", "Trending styles", "Client handling"] },
        { title: "Nail Art & Manicure Pedicure", slug: "nail-art-manicure-pedicure", duration: "1 Month", hours: "40 hours", level: "BEGINNER", fee: 10000, description: "Nail art basics to advanced — gel nails, extensions, nail art designs, and spa manicure/pedicure.", topics: ["Manicure & pedicure", "Gel nails", "Nail extensions", "Nail art designs", "Spa treatments", "Hygiene & safety"] },
        { title: "Complete Beauty Academy", slug: "complete-beauty-academy", duration: "6 Months", hours: "240 hours", level: "ADVANCED", fee: 120000, description: "Complete beauty professional course covering makeup, hair, skin, nails, and business management.", topics: ["All makeup techniques", "Hair styling", "Skin care & facials", "Nail art", "Business management", "Portfolio & marketing", "Placement assistance"] },
      ];

      await Course.insertMany(courses);
      console.log(`✅ ${courses.length} courses seeded`);
    } else {
      console.log(`ℹ️  ${coursesCount} courses already exist`);
    }

    console.log("\n🎋 Seed complete!\n");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seed error:", error.message);
    process.exit(1);
  }
}

seed();
