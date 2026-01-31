/**
 * Seed Demo Scholarship and Field Mappings
 *
 * Creates a mock scholarship application and field mappings
 * for testing the browser extension on the /demo page.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seedDemoScholarship() {
  console.log("🌱 Seeding demo scholarship data...");

  // First, find or create a test user
  const testUser = await prisma.user.upsert({
    where: { email: "test@mobile.test" },
    update: {},
    create: {
      email: "test@mobile.test",
    },
  });
  console.log("✅ Test user:", testUser.email);

  // Create or update demo scholarship
  const demoScholarship = await prisma.scrapedScholarship.upsert({
    where: {
      id: "demo-scholarship-cuid",
    },
    update: {},
    create: {
      id: "demo-scholarship-cuid",
      portal: "demo",
      title: "Demo Scholarship Application",
      description: "A mock scholarship application for testing the browser extension.",
      amount: 1000,
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      requirements: {
        eligible: ["Undergraduate students", "GPA 3.0+"],
        documents: ["Transcript", "Essay"],
      },
      applicationUrl: "http://localhost:3030/demo",
      sourceUrl: "http://localhost:3030/demo",
      scrapeStatus: "success",
      applicationSections: [
        {
          name: "Personal Information",
          questions: [
            { id: "firstName", label: "First Name", type: "text", required: true },
            { id: "lastName", label: "Last Name", type: "text", required: true },
            { id: "email", label: "Email Address", type: "email", required: true },
            { id: "phone", label: "Phone Number", type: "tel", required: false },
          ],
        },
        {
          name: "Academic Information",
          questions: [
            { id: "gpa", label: "Cumulative GPA", type: "number", required: true },
            { id: "classLevel", label: "Class Level", type: "select", required: true, options: ["freshman", "sophomore", "junior", "senior", "graduate"] },
            { id: "major", label: "Major / Field of Study", type: "text", required: true },
            { id: "enrollmentStatus", label: "Enrollment Status", type: "select", required: true, options: ["full_time", "part_time"] },
            { id: "graduationDate", label: "Expected Graduation Date", type: "month", required: false },
          ],
        },
        {
          name: "Essay Questions",
          questions: [
            { id: "leadership", label: "Leadership Experience", type: "textarea", required: true },
            { id: "goals", label: "Academic and Career Goals", type: "textarea", required: true },
            { id: "challenges", label: "Overcoming Challenges", type: "textarea", required: false },
            { id: "communityService", label: "Community Service", type: "textarea", required: true },
          ],
        },
        {
          name: "Financial Information",
          questions: [
            { id: "income", label: "Household Income", type: "select", required: false, options: ["0-30000", "30000-50000", "50000-75000", "75000-100000", "100000+"] },
            { id: "fafsa", label: "FAFSA", type: "select", required: false, options: ["yes", "no", "not_applicable"] },
          ],
        },
      ],
    },
  });
  console.log("✅ Demo scholarship:", demoScholarship.id);

  // Delete existing field mappings for this scholarship
  await prisma.fieldMapping.deleteMany({
    where: { scholarshipId: demoScholarship.id },
  });

  // Field mappings with AI-approved responses
  const fieldMappings = [
    // Personal Information
    {
      scholarshipId: demoScholarship.id,
      userId: testUser.id,
      fieldName: "firstName",
      fieldLabel: "First Name",
      fieldType: "text",
      approvedValue: "Jane",
      approved: true,
      approvedAt: new Date(),
      source: "agent",
    },
    {
      scholarshipId: demoScholarship.id,
      userId: testUser.id,
      fieldName: "lastName",
      fieldLabel: "Last Name",
      fieldType: "text",
      approvedValue: "Doe",
      approved: true,
      approvedAt: new Date(),
      source: "agent",
    },
    {
      scholarshipId: demoScholarship.id,
      userId: testUser.id,
      fieldName: "email",
      fieldLabel: "Email",
      fieldType: "email",
      approvedValue: "jane.doe@example.com",
      approved: true,
      approvedAt: new Date(),
      source: "agent",
    },
    {
      scholarshipId: demoScholarship.id,
      userId: testUser.id,
      fieldName: "phone",
      fieldLabel: "Phone",
      fieldType: "tel",
      approvedValue: "(555) 123-4567",
      approved: true,
      approvedAt: new Date(),
      source: "agent",
    },

    // Academic Information
    {
      scholarshipId: demoScholarship.id,
      userId: testUser.id,
      fieldName: "gpa",
      fieldLabel: "GPA",
      fieldType: "number",
      approvedValue: "3.75",
      approved: true,
      approvedAt: new Date(),
      source: "agent",
    },
    {
      scholarshipId: demoScholarship.id,
      userId: testUser.id,
      fieldName: "classLevel",
      fieldLabel: "Class Level",
      fieldType: "select",
      approvedValue: "junior",
      approved: true,
      approvedAt: new Date(),
      source: "agent",
    },
    {
      scholarshipId: demoScholarship.id,
      userId: testUser.id,
      fieldName: "major",
      fieldLabel: "Major",
      fieldType: "text",
      approvedValue: "Computer Science",
      approved: true,
      approvedAt: new Date(),
      source: "agent",
    },
    {
      scholarshipId: demoScholarship.id,
      userId: testUser.id,
      fieldName: "enrollmentStatus",
      fieldLabel: "Enrollment Status",
      fieldType: "select",
      approvedValue: "full_time",
      approved: true,
      approvedAt: new Date(),
      source: "agent",
    },

    // Essay Questions
    {
      scholarshipId: demoScholarship.id,
      userId: testUser.id,
      fieldName: "leadership",
      fieldLabel: "Leadership Experience",
      fieldType: "textarea",
      approvedValue: `During my sophomore year, I served as the president of our university's Computer Science Club, where I organized weekly coding workshops and mentored underclassmen. This experience taught me the importance of clear communication and leading by example. I learned that effective leadership isn't just about giving orders—it's about empowering others to succeed.

One particular challenge was organizing our annual hackathon. I had to coordinate with sponsors, manage logistics, and ensure participants had everything they needed. When we faced a last-minute venue change, I quickly mobilized the team to relocate everything smoothly. This experience taught me that adaptability and remaining calm under pressure are essential leadership qualities.

As president, I also started a peer mentoring program that paired experienced members with newcomers. This not only helped new members learn faster but also gave experienced members the opportunity to develop their teaching skills. The program has continued beyond my tenure and is now a permanent part of our club's offerings.`,
      approved: true,
      approvedAt: new Date(),
      source: "agent",
    },
    {
      scholarshipId: demoScholarship.id,
      userId: testUser.id,
      fieldName: "goals",
      fieldLabel: "Academic and Career Goals",
      fieldType: "textarea",
      approvedValue: `My academic goal is to graduate with honors in Computer Science while gaining practical experience through internships. I'm particularly interested in artificial intelligence and machine learning, and I plan to take advanced courses in these areas during my junior and senior years.

My career goal is to become a software engineer at a company that creates technology for social good. I'm passionate about using AI to improve educational access for underserved communities. After graduation, I hope to work for an edtech company developing personalized learning tools.

Long-term, I aspire to pursue a graduate degree in machine learning and eventually lead a research team focused on making AI more accessible and equitable. I believe that technology has the power to bridge educational gaps, and I want to be at the forefront of that effort.

To achieve these goals, I'm currently building a strong foundation in algorithms, data structures, and machine learning fundamentals. I'm also seeking internship opportunities that will give me hands-on experience with real-world applications of AI.`,
      approved: true,
      approvedAt: new Date(),
      source: "agent",
    },
    {
      scholarshipId: demoScholarship.id,
      userId: testUser.id,
      fieldName: "challenges",
      fieldLabel: "Overcoming Challenges",
      fieldType: "textarea",
      approvedValue: `As a first-generation college student, I faced significant challenges adapting to university life. Coming from a high school with limited college preparation resources, I struggled initially with imposter syndrome and balancing work-study obligations with coursework.

During my first semester, I found myself falling behind in my introductory programming course. I felt like everyone else had prior experience and that I didn't belong. However, instead of giving up, I sought help from my professor during office hours and joined a study group with classmates.

I also took advantage of tutoring services offered by the university's diversity center. This not only helped me academically but also connected me with other first-generation students facing similar challenges. We formed a support network that met weekly to share study strategies and encouragement.

By the end of that first semester, not only did I pass the course, but I also earned an A-. More importantly, I gained confidence in my ability to succeed. This experience inspired me to found a peer mentoring program for first-year first-generation students. The program has now helped over 50 students navigate their first year successfully.

This journey taught me that challenges are opportunities for growth and that seeking help is a sign of strength, not weakness. It also fueled my passion for making education more accessible to all students.`,
      approved: true,
      approvedAt: new Date(),
      source: "agent",
    },
    {
      scholarshipId: demoScholarship.id,
      userId: testUser.id,
      fieldName: "communityService",
      fieldLabel: "Community Service",
      fieldType: "textarea",
      approvedValue: `I'm deeply committed to giving back to my community through various service activities. Weekly, I volunteer at a local food bank where I help organize food distribution for over 200 families. This work has given me perspective on food insecurity and motivated me to start a campus initiative that redirects leftover cafeteria food to local shelters.

I also tutor K-12 students in math and computer science through a community center program. Working with students who may not have access to quality STEM education has been incredibly rewarding. Last summer, I organized a charity coding bootcamp for high school students from underrepresented backgrounds, partnering with local tech companies to provide laptops and mentors.

On campus, I serve as a mentor for the Women in Tech organization, helping create a supportive environment for women in computer science. I've also participated in several hackathons focused on social good, including one where our team developed an app to help people with disabilities navigate public transportation.

Additionally, I've been involved in environmental conservation efforts, including organizing tree-planting events and beach cleanups. These experiences have taught me the importance of environmental stewardship and community engagement.

Through these activities, I've developed leadership skills, empathy, and a deeper understanding of the diverse challenges facing different communities. I believe that service is not just about helping others, but also about learning from them and growing together.`,
      approved: true,
      approvedAt: new Date(),
      source: "agent",
    },

    // Financial Information
    {
      scholarshipId: demoScholarship.id,
      userId: testUser.id,
      fieldName: "income",
      fieldLabel: "Household Income",
      fieldType: "select",
      approvedValue: "50000-75000",
      approved: true,
      approvedAt: new Date(),
      source: "agent",
    },
    {
      scholarshipId: demoScholarship.id,
      userId: testUser.id,
      fieldName: "fafsa",
      fieldLabel: "FAFSA",
      fieldType: "select",
      approvedValue: "yes",
      approved: true,
      approvedAt: new Date(),
      source: "agent",
    },
  ];

  // Create field mappings
  for (const mapping of fieldMappings) {
    await prisma.fieldMapping.create({ data: mapping });
  }

  console.log(`✅ Created ${fieldMappings.length} field mappings`);

  // Create an application for this scholarship
  const application = await prisma.application.upsert({
    where: {
      id: "demo-application-cuid",
    },
    update: {},
    create: {
      id: "demo-application-cuid",
      userId: testUser.id,
      scrapedScholarshipId: demoScholarship.id,
      status: "in_progress",
    },
  });
  console.log("✅ Demo application:", application.id);

  console.log("\n🎉 Demo scholarship seeded successfully!");
  console.log(`   Scholarship ID: ${demoScholarship.id}`);
  console.log(`   Application ID: ${application.id}`);
  console.log(`   User: ${testUser.email}`);
  console.log(`   Field Mappings: ${fieldMappings.length}`);
}

seedDemoScholarship()
  .catch((e) => {
    console.error("❌ Error seeding demo scholarship:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
