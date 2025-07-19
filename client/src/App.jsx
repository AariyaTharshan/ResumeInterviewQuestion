import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { GoogleGenAI } from '@google/genai';
import jsPDF from 'jspdf';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';

const App = () => {
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeText, setResumeText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mcqQuestions, setMcqQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [showResults, setShowResults] = useState(false);
  const [score, setScore] = useState(0);
  const [error, setError] = useState('');
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);

  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

  // Function to structure resume text for better question generation
  const structureResumeText = (text) => {
    const sections = {
      skills: [],
      projects: [],
      experience: [],
      education: [],
      achievements: []
    };

    // Extract technical skills (common patterns)
    const skillPatterns = [
      /(?:skills?|technologies?|languages?|tools?|frameworks?|libraries?)[:\s]+([^.\n]+)/gi,
      /(?:proficient in|experienced with|knowledge of|expertise in)[:\s]+([^.\n]+)/gi,
      /(?:programming languages?|languages?|technologies?)[:\s]+([^.\n]+)/gi,
      /(?:frontend|backend|database|cloud|devops|testing)[:\s]+([^.\n]+)/gi,
      /(?:javascript|python|java|c\+\+|react|angular|vue|node|express|mongodb|mysql|aws|docker|kubernetes|git)[:\s]*/gi
    ];

    skillPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const skills = match.replace(/^(?:skills?|technologies?|languages?|tools?|frameworks?|proficient in|experienced with|knowledge of|programming languages?)[:\s]+/i, '');
          sections.skills.push(...skills.split(/[,&]/).map(s => s.trim()).filter(s => s.length > 1));
        });
      }
    });

    // Extract technical projects
    const projectPatterns = [
      /(?:project|developed|built|created|implemented)[:\s]+([^.\n]+)/gi,
      /(?:github|portfolio|repository|codebase)[:\s]+([^.\n]+)/gi,
      /(?:web app|mobile app|api|database|algorithm|system|application)[:\s]+([^.\n]+)/gi,
      /(?:using|with|built with|developed using)[:\s]+([^.\n]+)/gi
    ];

    projectPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        sections.projects.push(...matches.map(match => match.replace(/^(?:project|developed|built|created|github|portfolio|repository)[:\s]+/i, '')));
      }
    });

    // Extract experience
    const experiencePatterns = [
      /(?:experience|work|job|position|role)[:\s]+([^.\n]+)/gi,
      /(?:company|organization|employer)[:\s]+([^.\n]+)/gi
    ];

    experiencePatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        sections.experience.push(...matches.map(match => match.replace(/^(?:experience|work|job|position|role|company|organization|employer)[:\s]+/i, '')));
      }
    });

    // Extract education
    const educationPatterns = [
      /(?:education|degree|university|college|school)[:\s]+([^.\n]+)/gi,
      /(?:bachelor|master|phd|diploma)[:\s]+([^.\n]+)/gi
    ];

    educationPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        sections.education.push(...matches.map(match => match.replace(/^(?:education|degree|university|college|school|bachelor|master|phd|diploma)[:\s]+/i, '')));
      }
    });

    // Extract achievements
    const achievementPatterns = [
      /(?:achievement|award|certification|certificate)[:\s]+([^.\n]+)/gi,
      /(?:honor|recognition|accomplishment)[:\s]+([^.\n]+)/gi
    ];

    achievementPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        sections.achievements.push(...matches.map(match => match.replace(/^(?:achievement|award|certification|certificate|honor|recognition|accomplishment)[:\s]+/i, '')));
      }
    });

    // Create structured text with technical focus
    let structuredText = text;
    
    // Prioritize technical sections
    if (sections.skills.length > 0) {
      structuredText += `\n\nTECHNICAL SKILLS: ${sections.skills.join(', ')}`;
    }
    if (sections.projects.length > 0) {
      structuredText += `\n\nTECHNICAL PROJECTS: ${sections.projects.join('; ')}`;
    }
    
    // Add technical experience (filter for technical roles)
    const technicalExperience = sections.experience.filter(exp => 
      /(?:developer|engineer|programmer|architect|devops|data|software|frontend|backend|full.?stack)/i.test(exp)
    );
    if (technicalExperience.length > 0) {
      structuredText += `\n\nTECHNICAL EXPERIENCE: ${technicalExperience.join('; ')}`;
    }
    
    // Add technical education (filter for technical degrees/courses)
    const technicalEducation = sections.education.filter(edu => 
      /(?:computer|software|engineering|technology|science|programming|development)/i.test(edu)
    );
    if (technicalEducation.length > 0) {
      structuredText += `\n\nTECHNICAL EDUCATION: ${technicalEducation.join('; ')}`;
    }
    
    // Add technical certifications
    const technicalAchievements = sections.achievements.filter(ach => 
      /(?:certified|certification|aws|azure|google|microsoft|oracle|cisco|comptia|agile|scrum)/i.test(ach)
    );
    if (technicalAchievements.length > 0) {
      structuredText += `\n\nTECHNICAL CERTIFICATIONS: ${technicalAchievements.join('; ')}`;
    }

    return structuredText;
  };

  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (file) {
      setResumeFile(file);
      setError('');
      
                    try {
        if (file.type === 'application/pdf') {
          // Handle PDF files using a simple text extraction approach
          const arrayBuffer = await file.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          
          // Convert to string and extract readable text
          const decoder = new TextDecoder('utf-8');
          const pdfString = decoder.decode(uint8Array);
          
          // Extract text content using regex patterns
          let extractedText = '';
          
          // Method 1: Extract text between parentheses (common in PDFs)
          const textInParentheses = pdfString.match(/\(([^)]+)\)/g);
          if (textInParentheses) {
            extractedText += textInParentheses
              .map(match => match.slice(1, -1))
              .filter(str => str.length > 3 && /[a-zA-Z]/.test(str))
              .join(' ');
          }
          
          // Method 2: Extract readable text blocks
          const textBlocks = pdfString
            .split(/[\x00-\x1F\x7F-\x9F]/) // Split by control characters
            .filter(block => block.length > 10 && /[a-zA-Z]/.test(block))
            .map(block => block.replace(/[^\w\s.,!?-]/g, ' ').trim())
            .filter(block => block.length > 5);
          
          if (textBlocks.length > 0) {
            extractedText += ' ' + textBlocks.join(' ');
          }
          
          // Method 3: Extract words and sentences
          const words = pdfString
            .match(/[a-zA-Z]+/g)
            ?.filter(word => word.length > 2)
            ?.join(' ') || '';
          
          if (words.length > extractedText.length) {
            extractedText = words;
          }
          
          // Clean up the extracted text and structure it better
          const cleanText = extractedText
            .replace(/\s+/g, ' ')
            .replace(/[^\w\s.,!?-]/g, ' ')
            .trim()
            .substring(0, 3000); // Limit length
          
          // Try to identify and structure key sections
          const structuredText = structureResumeText(cleanText);
          
          if (cleanText.length > 50) {
            setResumeText(structuredText);
            setError(''); // Clear any previous errors
          } else {
            setError('Unable to extract readable text from this PDF. Please try a different PDF file.');
            setResumeText('');
          }
        } else {
          setError('Please upload a PDF file. Only PDF files are supported.');
          setResumeText('');
        }
      } catch (error) {
        console.error('Error reading file:', error);
        setError('Failed to read the PDF file. Please try a different PDF file.');
        setResumeText('');
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    multiple: false
  });

  const generateMCQ = async () => {
    if (!resumeText.trim()) {
      setError('Please upload a resume first');
      return;
    }

    if (!ai) {
      setError('API key not configured. Please check your environment variables.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const prompt = `Analyze this structured resume content and generate 15 TECHNICAL multiple choice interview questions with difficulty levels from EASY to MEDIUM, specifically tailored to the candidate's technical background: "${resumeText.substring(0, 2500)}"

      Generate ONLY TECHNICAL questions focusing on:
      1. **Programming Languages & Frameworks**: Questions about specific languages, frameworks, libraries mentioned in their skills (e.g., React hooks, Python data structures, JavaScript ES6 features)
      2. **Technical Projects**: Questions about the specific technologies, algorithms, or technical challenges in their projects
      3. **Development Tools & Technologies**: Questions about databases, APIs, cloud services, version control, testing frameworks they've used
      4. **Technical Concepts**: Questions about software architecture, design patterns, algorithms, data structures related to their experience
      5. **Technical Certifications**: Questions about specific technical knowledge from their certifications

      DIFFICULTY DISTRIBUTION:
      - 8 EASY questions: Basic concepts, fundamental knowledge, syntax, common patterns
      - 7 MEDIUM questions: Intermediate concepts, practical applications, problem-solving scenarios

      AVOID general questions about:
      - Soft skills, teamwork, communication
      - General work experience or company culture
      - Non-technical achievements
      - General education topics
      - Personal background or hobbies

      Format the response as a JSON array with this exact structure:
      [
        {
          "question": "Technical question about specific technology/concept",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "correctAnswer": 0,
          "difficulty": "easy",
          "explanation": "Technical explanation with specific details from their resume"
        }
      ]
      
      Requirements:
      - Generate exactly 15 questions total
      - Questions must be HIGHLY TECHNICAL and specific to technologies/skills mentioned in the resume
      - Focus on programming concepts, frameworks, tools, algorithms, or technical implementations
      - All 4 options should be technically plausible but only one should be correct
      - correctAnswer should be the index (0-3) of the correct option
      - Add "difficulty" field with value "easy" or "medium" for each question
      - Explanations should include technical details and reference specific technologies from their resume
      - Questions should test technical knowledge appropriate for the difficulty level
      - Return only valid JSON without any additional text`;

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt
      });

      const responseText = response.text;
      
      // Extract JSON from response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const questions = JSON.parse(jsonMatch[0]);
        setMcqQuestions(questions);
        setCurrentQuestionIndex(0);
        setUserAnswers({});
        setShowResults(false);
      } else {
        throw new Error('Failed to parse questions from API response');
      }
    } catch (err) {
      console.error('Error generating MCQ:', err);
      setError('Failed to generate questions. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnswerSelect = (questionIndex, selectedOption) => {
    setUserAnswers(prev => ({
      ...prev,
      [questionIndex]: selectedOption
    }));
  };

  const calculateScore = () => {
    let correctAnswers = 0;
    let totalQuestions = mcqQuestions.length;
    
    mcqQuestions.forEach((question, index) => {
      if (userAnswers[index] === question.correctAnswer) {
        correctAnswers++;
      }
    });
    
    const percentage = (correctAnswers / totalQuestions) * 100;
    setScore(percentage);
    setShowResults(true);
  };

  const getScoreMessage = (score) => {
    if (score >= 90) return 'Excellent! Outstanding performance!';
    if (score >= 80) return 'Great job! You have strong knowledge in this area.';
    if (score >= 70) return 'Good work! You have solid understanding.';
    if (score >= 60) return 'Fair performance. Keep learning and improving.';
    if (score >= 50) return 'Below average. Consider reviewing the topics.';
    return 'Needs improvement. Focus on learning the fundamentals.';
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'bg-green-600 shadow-green-500/50';
    if (score >= 60) return 'bg-yellow-600 shadow-yellow-500/50';
    return 'bg-red-600 shadow-red-500/50';
  };

  const resetQuiz = () => {
    setMcqQuestions([]);
    setCurrentQuestionIndex(0);
    setUserAnswers({});
    setShowResults(false);
    setScore(0);
  };

  const handleReferenceClick = async (question) => {
    if (!ai) {
      setError('API key not configured. Please check your environment variables.');
      return;
    }
    setReferenceLoading(true);
    try {
      const newWindow = window.open();
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <title>Reference: ${question.question}</title>
  <meta charset='utf-8'>
  <meta name='viewport' content='width=device-width,initial-scale=1'>
  <link href="https://fonts.googleapis.com/css?family=Inter:400,600,700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/github-dark.min.css">
  <style>
    body {
      background: linear-gradient(135deg, #18181b 0%, #23272f 100%);
      color: #fff;
      font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
      margin: 0;
      padding: 0;
      min-height: 100vh;
      overflow-x: hidden;
    }
    .navbar {
      background: rgba(24,24,27,0.95);
      padding: 1.2rem 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #23272f;
      box-shadow: 0 2px 12px #0002;
      position: sticky;
      top: 0;
      z-index: 10;
      backdrop-filter: blur(8px);
    }
    .navbar .brand {
      color: #f59e42;
      font-size: 1.7rem;
      font-weight: 700;
      letter-spacing: 1px;
      text-decoration: none;
      text-shadow: 0 2px 8px #f59e4222;
    }
    .navbar .back {
      color: #fff;
      background: #f59e42;
      padding: 0.6rem 1.4rem;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      font-size: 1rem;
      border: none;
      transition: background 0.2s, color 0.2s;
      cursor: pointer;
      box-shadow: 0 2px 8px #f59e4222;
    }
    .navbar .back:hover {
      background: #ffb95e;
      color: #23272f;
    }
    .container {
      max-width: 820px;
      margin: 3rem auto 2rem auto;
      background: rgba(35,39,47,0.97);
      border-radius: 22px;
      box-shadow: 0 8px 40px #0007;
      padding: 2.7rem 2.2rem 2.2rem 2.2rem;
      position: relative;
      animation: fadeInUp 0.7s cubic-bezier(.23,1.01,.32,1) both;
      backdrop-filter: blur(6px);
    }
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(40px);}
      to { opacity: 1; transform: none;}
    }
    h1 {
      color: #f59e42;
      font-size: 2.3rem;
      margin-bottom: 1.2rem;
      line-height: 1.2;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-shadow: 0 2px 8px #f59e4222;
    }
    h2, h3 {
      color: #ffb95e;
      margin-top: 2rem;
      margin-bottom: 1rem;
      font-weight: 600;
      text-shadow: 0 2px 8px #f59e4222;
    }
    p, li {
      font-size: 1.18rem;
      line-height: 2.0;
      color: #e5e5e5;
      margin-bottom: 1.1rem;
      letter-spacing: 0.01em;
    }
    ul, ol {
      margin-left: 1.5rem;
      margin-bottom: 1.2rem;
    }
    pre, code {
      background: #18181b;
      color: #f59e42;
      border-radius: 10px;
      padding: 1.1rem;
      font-size: 1.08rem;
      overflow-x: auto;
      margin: 1.7rem 0;
      display: block;
      font-family: 'Fira Mono', 'Consolas', 'Menlo', monospace;
    }
    code {
      display: inline;
      padding: 0.2em 0.4em;
      margin: 0 0.1em;
      font-size: 1em;
      border-radius: 6px;
      background: #23272f;
      color: #f59e42;
    }
    blockquote {
      border-left: 4px solid #f59e42;
      background: #23272f;
      color: #ffb95e;
      margin: 1.5em 0;
      padding: 1em 1.5em;
      border-radius: 8px;
      font-style: italic;
    }
    a {
      color: #f59e42;
      text-decoration: underline;
      transition: color 0.2s;
    }
    a:hover {
      color: #ffb95e;
    }
    strong, b {
      color: #ffb95e;
      font-weight: 600;
    }
    .error-message {
      color: #ff6b6b;
      background: #2d1a1a;
      border: 1px solid #ff6b6b;
      border-radius: 8px;
      padding: 1.2rem 1.5rem;
      margin: 2rem 0;
      font-size: 1.2rem;
      text-align: center;
    }
    .spinner {
      margin: 3rem auto 2rem auto;
      border: 6px solid #23272f;
      border-top: 6px solid #f59e42;
      border-radius: 50%;
      width: 60px;
      height: 60px;
      animation: spin 1s linear infinite;
      display: block;
    }
    @keyframes spin {
      0% { transform: rotate(0deg);}
      100% { transform: rotate(360deg);}
    }
    @media (max-width: 700px) {
      .container { padding: 1.2rem; }
      h1 { font-size: 1.3rem; }
      .navbar { flex-direction: column; gap: 0.7rem; }
    }
  </style>
</head>
<body>
  <div class="navbar">
    <span class="brand">Resume Interview Quiz</span>
    <button class="back" onclick="window.close();return false;">Back to Quiz</button>
  </div>
  <div class="container">
    <h1>Reference: ${question.question}</h1>
    <div id="content">
      <div class="spinner"></div>
    </div>
  </div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.1/marked.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/highlight.min.js"></script>
  <script>
    function renderContent(markdown, error) {
      const contentDiv = document.getElementById('content');
      if (error) {
        contentDiv.innerHTML = '<div class=\"error-message\">' + error + '</div>';
        return;
      }
      const html = marked.parse(markdown, {
        mangle: false,
        headerIds: true,
        highlight: function(code, lang) {
          if (window.hljs && lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
          }
          return code;
        }
      });
      contentDiv.innerHTML = html;
      document.querySelectorAll('pre code').forEach((block) => {
        if (window.hljs) hljs.highlightElement(block);
      });
    }
    // The parent window will call this function with the markdown or error
    window.renderReferenceContent = renderContent;
  </script>
</body>
</html>
`;
      newWindow.document.write(html);
      newWindow.document.close();

      try {
        const prompt = `Explain and summarize the following technical topic for an interview candidate. Provide a concise, clear, and practical explanation with examples if possible.\n\nTopic: ${question.question}`;
        const response = await ai.models.generateContent({
          model: "gemini-2.0-flash",
          contents: prompt
        });
        const summary = response.text;
        // Call the render function in the new window
        newWindow.renderReferenceContent(summary, null);
      } catch (err) {
        newWindow.renderReferenceContent('', 'Failed to fetch reference from Gemini. Please try again later.');
      }
    } catch (err) {
      setError('Failed to fetch reference from Gemini.');
    } finally {
      setReferenceLoading(false);
    }
  };

  const fetchLeaderboard = async () => {
    const res = await fetch('https://resumeinterviewquestion.onrender.com/api/leaderboard');
    const data = await res.json();
    setLeaderboard(data);
  };

  // After quiz submission, POST user info and score
  useEffect(() => {
    if (showResults && user) {
      fetch('https://resumeinterviewquestion.onrender.com/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: user.name,
          email: user.email,
          picture: user.picture,
          googleId: user.sub,
          score: Math.round(score)
        })
      })
      .then(res => res.json())
      .then(data => {
        // Optionally show a toast: 'New High Score!'
      });
    }
  }, [showResults, user, score]);

  // In the PDF report, use user's name on the cover page
  const handleDownloadReport = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 60;

    // Cover Page
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.setTextColor('#f59e42');
    doc.text('Resume Interview Quiz Report', pageWidth / 2, 120, { align: 'center' });
    doc.setFontSize(16);
    doc.setTextColor('#222');
    doc.text(`Name: ${user?.name || 'Anonymous'}`, pageWidth / 2, 180, { align: 'center' });
    doc.text(`Date: ${new Date().toLocaleDateString()}`, pageWidth / 2, 210, { align: 'center' });
    doc.setFontSize(14);
    doc.text(`Score: ${Math.round(score)}%`, pageWidth / 2, 240, { align: 'center' });
    doc.text(`Correct Answers: ${mcqQuestions.filter((_, idx) => userAnswers[idx] === mcqQuestions[idx].correctAnswer).length} / ${mcqQuestions.length}`, pageWidth / 2, 260, { align: 'center' });
    doc.setFontSize(12);
    doc.setTextColor('#888');
    doc.text('Powered by Resume Interview Quiz', pageWidth / 2, 300, { align: 'center' });
    doc.addPage();

    // Questions Section
    let questionY = 60;
    mcqQuestions.forEach((q, idx) => {
      if (questionY > 700) { doc.addPage(); questionY = 60; }

      // Card background
      doc.setFillColor(247, 247, 247);
      doc.roundedRect(40, questionY, pageWidth - 80, 120, 16, 16, 'F');

      // Question number and text
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor('#f59e42');
      doc.text(`Q${idx + 1}:`, 55, questionY + 30);
      doc.setFontSize(14);
      doc.setTextColor('#222');
      doc.text(q.question, 110, questionY + 30, { maxWidth: pageWidth - 160 });

      let optY = questionY + 55;
      q.options.forEach((opt, optIdx) => {
        let isCorrect = optIdx === q.correctAnswer;
        let isUser = userAnswers[idx] === optIdx;
        let bg = null, color = '#222', fontWeight = 'normal';

        if (isCorrect && isUser) { bg = '#388e3c'; color = '#fff'; fontWeight = 'bold'; }
        else if (isCorrect) { bg = '#388e3c'; color = '#fff'; fontWeight = 'bold'; }
        else if (isUser) { bg = '#d32f2f'; color = '#fff'; fontWeight = 'bold'; }

        if (bg) {
          doc.setFillColor(bg);
          doc.roundedRect(60, optY - 13, pageWidth - 140, 24, 8, 8, 'F');
        }
        doc.setFont('helvetica', fontWeight);
        doc.setFontSize(13);
        doc.setTextColor(color);
        doc.text(`${String.fromCharCode(65 + optIdx)}. ${opt}`, 70, optY, { maxWidth: pageWidth - 160 });
        optY += 22;
        doc.setTextColor('#222');
      });

      // Explanation
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(12);
      doc.setTextColor('#888');
      const explanationLines = doc.splitTextToSize(`Explanation: ${q.explanation}`, pageWidth - 120);
      doc.text(explanationLines, 70, optY + 10);

      // Orange divider
      questionY = optY + explanationLines.length * 13 + 30;
      doc.setDrawColor('#f59e42');
      doc.setLineWidth(1.2);
      doc.line(60, questionY, pageWidth - 60, questionY);
      questionY += 30;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor('#222');
    });

    // Footer with page numbers
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(10);
      doc.setTextColor('#888');
      doc.text(`Page ${i} of ${pageCount}`, pageWidth - 80, 820);
    }

    doc.save('quiz-report.pdf');
  };

  // Wrap the app in GoogleOAuthProvider and show login if not logged in
  return (
    <GoogleOAuthProvider clientId="857207064247-pjblhe6k6lhhqr2etfu05n6n9p896g5c.apps.googleusercontent.com">
      {!user ? (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black">
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-10 flex flex-col items-center">
            <h1 className="text-4xl font-bold text-white mb-4">
              <span className="text-orange-500">Resume</span> Interview Quiz
            </h1>
            <p className="text-gray-300 text-lg mb-8">Sign in with Google to start your personalized quiz</p>
            <GoogleLogin
              onSuccess={credentialResponse => {
                const decoded = jwtDecode(credentialResponse.credential);
                setUser(decoded);
              }}
              onError={() => setError('Login Failed')}
              useOneTap
              theme="filled_black"
              text="continue_with"
              shape="pill"
              width="300"
            />
            {error && <p className="mt-6 text-red-400 bg-red-900/20 border border-red-500/30 rounded-xl p-3">{error}</p>}
          </div>
        </div>
      ) : (
        <div className="min-h-screen bg-black text-white py-8 px-4">
          <div className="max-w-4xl mx-auto">
            {/* User profile section */}
            <div className="flex items-center gap-4 mb-8">
              {user?.picture && (
                <img src={user.picture} alt="User profile" className="w-16 h-16 rounded-full border-4 border-orange-500 shadow-lg" />
              )}
              <div>
                <div className="text-lg font-bold text-white">{user?.name}</div>
                {user?.email && <div className="text-gray-400 text-sm">{user.email}</div>}
              </div>
            </div>
            <div className="text-center mb-8">
              <h1 className="text-5xl font-bold text-white mb-3">
                <span className="text-orange-500">Resume</span> Interview Quiz
              </h1>
              <p className="text-gray-300 text-lg">
                Upload your resume and get personalized technical questions
              </p>
            </div>

            {user && (
              <button
                onClick={() => { setShowLeaderboard(true); fetchLeaderboard(); }}
                className="fixed top-6 right-8 z-50 bg-orange-500 hover:bg-orange-600 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg transition-all duration-300"
                title="Show Leaderboard"
              >
                {/* Trophy SVG icon */}
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 21h8M12 17v4M7 4h10v2a5 5 0 01-10 0V4zm-2 2a2 2 0 01-2 2v2a5 5 0 002 4m14-8a2 2 0 012 2v2a5 5 0 01-2 4" />
                </svg>
              </button>
            )}
            {showLeaderboard && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
                <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-8 w-full max-w-lg relative">
                  <button
                    onClick={() => setShowLeaderboard(false)}
                    className="absolute top-4 right-4 text-gray-400 hover:text-orange-500 text-2xl font-bold"
                    title="Close"
                  >&times;</button>
                  <h2 className="text-2xl font-bold text-orange-500 mb-6 text-center">Leaderboard</h2>
                  <ol className="list-decimal ml-6">
                    {leaderboard.length === 0 && <li className="text-gray-400">No scores yet.</li>}
                    {leaderboard.map((entry, idx) => (
                      <li key={entry._id || idx} className="mb-3 flex items-center gap-3">
                        {entry.picture && (
                          <img src={entry.picture} alt={entry.name} className="w-8 h-8 rounded-full border-2 border-orange-500" />
                        )}
                        <span className="font-bold text-white">{entry.name}</span>
                        <span className="text-gray-400 text-xs">{entry.email}</span>
                        <span className="ml-auto text-orange-400 font-bold text-lg">{entry.score}%</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}

            {/* Resume Upload Section */}
            <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-8 mb-8">
              <h2 className="text-3xl font-bold mb-6 text-white">
                <span className="text-orange-500">Step 1:</span> Upload Your Resume
              </h2>
              
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-300 ${
                  isDragActive
                    ? 'border-orange-500 bg-orange-500/10'
                    : 'border-gray-600 hover:border-orange-500 hover:bg-gray-800'
                }`}
              >
                <input {...getInputProps()} />
                <div className="text-gray-300">
                  {isDragActive ? (
                    <p className="text-orange-500 font-semibold text-lg">Drop the resume here...</p>
                  ) : (
                    <div>
                      <svg className="mx-auto h-16 w-16 text-orange-500 mb-6" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                        <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <p className="text-xl font-medium mb-2">Drag & drop your resume here, or click to select</p>
                      <p className="text-sm text-gray-400">
                        Supports: PDF files only
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {resumeFile && (
                <div className="mt-6 p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
                  <p className="text-green-400 font-medium">
                    ✓ Uploaded: {resumeFile.name}
                  </p>
                </div>
              )}

              {resumeText && (
                <div className="mt-6 p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
                  <p className="text-green-400 font-medium">
                    ✓ Resume uploaded successfully! Ready to generate questions.
                  </p>
                </div>
              )}

              <button
                onClick={generateMCQ}
                disabled={!resumeText || isLoading}
                className="mt-8 w-full bg-orange-500 text-white py-4 px-8 rounded-xl font-bold text-lg hover:bg-orange-600 disabled:bg-gray-700 disabled:cursor-not-allowed transition-all duration-300 shadow-lg hover:shadow-orange-500/25"
              >
                {isLoading ? 'Generating Questions...' : 'Generate Technical Questions'}
              </button>
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 mb-6">
                <p className="text-red-400">{error}</p>
              </div>
            )}

            {/* MCQ Questions Section */}
            {mcqQuestions.length > 0 && !showResults && (
              <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-8 mb-8">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-3xl font-bold text-white">
                    Question <span className="text-orange-500">{currentQuestionIndex + 1}</span> of {mcqQuestions.length}
                  </h2>
                  <div className="text-sm text-gray-400 bg-gray-800 px-4 py-2 rounded-lg">
                    {Object.keys(userAnswers).length} / {mcqQuestions.length} answered
                  </div>
                </div>

                <div className="mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-medium text-white leading-relaxed">
                      {mcqQuestions[currentQuestionIndex].question}
                    </h3>
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                      mcqQuestions[currentQuestionIndex].difficulty === 'easy' 
                        ? 'bg-green-600 text-white' 
                        : 'bg-yellow-600 text-white'
                    }`}>
                      {mcqQuestions[currentQuestionIndex].difficulty?.toUpperCase() || 'MEDIUM'}
                    </span>
                  </div>

                  <div className="space-y-4">
                    {mcqQuestions[currentQuestionIndex].options.map((option, optionIndex) => (
                      <label
                        key={optionIndex}
                        className={`flex items-center p-5 border-2 rounded-xl cursor-pointer transition-all duration-300 ${
                          userAnswers[currentQuestionIndex] === optionIndex
                            ? 'border-orange-500 bg-orange-500/10'
                            : 'border-gray-600 hover:border-orange-500 hover:bg-gray-800'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`question-${currentQuestionIndex}`}
                          value={optionIndex}
                          checked={userAnswers[currentQuestionIndex] === optionIndex}
                          onChange={() => handleAnswerSelect(currentQuestionIndex, optionIndex)}
                          className="mr-4 text-orange-500"
                        />
                        <span className="text-gray-200 text-lg">{option}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-4 mt-6">
                  <button
                    onClick={() => handleReferenceClick(mcqQuestions[currentQuestionIndex])}
                    className="text-orange-400 underline hover:text-orange-300 font-medium text-base"
                    disabled={referenceLoading}
                    target="_blank"
                    rel="noopener noreferrer"
                    type="button"
                  >
                    {referenceLoading ? 'Loading Reference...' : 'Reference: Learn More'}
                  </button>
                </div>

                <div className="flex justify-between">
                  <button
                    onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                    disabled={currentQuestionIndex === 0}
                    className="px-8 py-3 bg-gray-700 text-white rounded-xl disabled:bg-gray-800 disabled:cursor-not-allowed hover:bg-gray-600 transition-all duration-300 font-medium"
                  >
                    Previous
                  </button>

                  {currentQuestionIndex < mcqQuestions.length - 1 ? (
                    <button
                      onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                      className="px-8 py-3 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-all duration-300 font-medium shadow-lg hover:shadow-orange-500/25"
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      onClick={calculateScore}
                      disabled={Object.keys(userAnswers).length < mcqQuestions.length}
                      className="px-8 py-3 bg-green-600 text-white rounded-xl disabled:bg-gray-700 disabled:cursor-not-allowed hover:bg-green-500 transition-all duration-300 font-medium shadow-lg hover:shadow-green-500/25"
                    >
                      Submit Quiz
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Results Section */}
            {showResults && (
              <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-8">
                <h2 className="text-4xl font-bold text-white mb-8 text-center">
                  Quiz <span className="text-orange-500">Results</span>
                </h2>

                <div className="text-center mb-10">
                  <div className={`inline-flex items-center justify-center w-40 h-40 rounded-full ${getScoreColor(score)} mb-8 shadow-2xl`}>
                    <span className="text-5xl font-bold text-white">
                      {Math.round(score)}%
                    </span>
                  </div>
                  <h3 className="text-3xl font-bold text-white mb-4">
                    Your Score: <span className="text-orange-500">{Math.round(score)}%</span>
                  </h3>
                  <p className="text-xl text-gray-300 mb-6 leading-relaxed">
                    {getScoreMessage(score)}
                  </p>
                  <div className="bg-gray-800 rounded-xl p-6 inline-block border border-gray-600">
                    <p className="text-lg text-gray-300 mb-2">
                      <strong className="text-orange-500">Correct Answers:</strong> {mcqQuestions.filter((_, index) => userAnswers[index] === mcqQuestions[index].correctAnswer).length} / {mcqQuestions.length}
                    </p>
                    <div className="flex gap-4 text-sm">
                      <span className="text-green-400">
                        Easy: {mcqQuestions.filter(q => q.difficulty === 'easy').filter((_, index) => userAnswers[index] === mcqQuestions[index].correctAnswer).length} / {mcqQuestions.filter(q => q.difficulty === 'easy').length}
                      </span>
                      <span className="text-yellow-400">
                        Medium: {mcqQuestions.filter(q => q.difficulty === 'medium').filter((_, index) => userAnswers[index] === mcqQuestions[index].correctAnswer).length} / {mcqQuestions.filter(q => q.difficulty === 'medium').length}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-8">
                  {mcqQuestions.map((question, index) => (
                    <div key={index} className="border border-gray-700 rounded-xl p-6 bg-gray-800/50">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-bold text-white text-lg">
                          Question {index + 1}: <span className="text-orange-500">{question.question}</span>
                        </h4>
                        <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                          question.difficulty === 'easy' 
                            ? 'bg-green-600 text-white' 
                            : 'bg-yellow-600 text-white'
                        }`}>
                          {question.difficulty?.toUpperCase() || 'MEDIUM'}
                        </span>
                      </div>
                      
                      <div className="space-y-3 mb-4">
                        {question.options.map((option, optionIndex) => (
                          <div
                            key={optionIndex}
                            className={`p-4 rounded-lg border-2 ${
                              optionIndex === question.correctAnswer
                                ? 'bg-green-900/30 border-green-500'
                                : optionIndex === userAnswers[index]
                                ? 'bg-red-900/30 border-red-500'
                                : 'bg-gray-700/50 border-gray-600'
                            }`}
                          >
                            <span className={`font-medium text-lg ${
                              optionIndex === question.correctAnswer
                                ? 'text-green-400'
                                : optionIndex === userAnswers[index]
                                ? 'text-red-400'
                                : 'text-gray-300'
                            }`}>
                              {optionIndex === question.correctAnswer ? '✓ ' : 
                               optionIndex === userAnswers[index] ? '✗ ' : '○ '}
                              {option}
                            </span>
                          </div>
                        ))}
                      </div>
                      
                      <div className="text-gray-300 bg-gray-800 p-4 rounded-lg border border-gray-600">
                        <strong className="text-orange-500">Explanation:</strong> {question.explanation}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="text-center mt-10">
                  <button
                    onClick={resetQuiz}
                    className="px-10 py-4 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-all duration-300 font-bold text-lg shadow-lg hover:shadow-orange-500/25"
                  >
                    Take Another Quiz
                  </button>
                  <button
                    onClick={handleDownloadReport}
                    className="ml-4 px-10 py-4 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-all duration-300 font-bold text-lg shadow-lg hover:shadow-orange-500/25 mt-6"
                  >
                    Download Report
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </GoogleOAuthProvider>
  );
};

export default App;
