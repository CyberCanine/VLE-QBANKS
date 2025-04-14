document.addEventListener('DOMContentLoaded', () => {
    // ===== UTILITY FUNCTIONS =====
    function shuffleArray(array) {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
    }

    function formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    function cleanField(field) {
        return field.replace(/^"+|"+$/g, '').trim();
    }

    // ===== THEME TOGGLE =====
    const initializeTheme = () => {
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            const savedTheme = localStorage.getItem('darkMode');
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (savedTheme === 'true' || (savedTheme === null && prefersDark)) {
                document.documentElement.classList.add('dark-mode');
            }
            themeToggle.addEventListener('click', () => {
                document.documentElement.classList.toggle('dark-mode');
                localStorage.setItem('darkMode', document.documentElement.classList.contains('dark-mode'));
            });
        }
    };

    // ===== CLOUDFLARE WORKER INTEGRATION =====
    async function loadQuestions(sheetId, sheetName) {
        try {
            const workerUrl = `https://hello.vleqbanks7151.workers.dev/?sheetId=${sheetId}&sheetName=${encodeURIComponent(sheetName)}`;
            console.log('Fetching from:', workerUrl);
            
            const response = await fetch(workerUrl);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch: ${response.status}`);
            }
            
            const csvData = await response.text();
            
            if (!csvData.includes(',')) {
                throw new Error('Invalid CSV data received');
            }
            
            return parseCSV(csvData);
        } catch (error) {
            console.error('Load Questions Error:', error);
            throw new Error('Failed to load questions. Please try again later.');
        }
    }

    async function loadQuestionsWithRetry(sheetId, sheetName, maxRetries = 3) {
        let lastError;
        for (let i = 0; i < maxRetries; i++) {
            try {
                const questions = await loadQuestions(sheetId, sheetName);
                if (questions && questions.length > 0) return questions;
            } catch (error) {
                lastError = error;
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        }
        throw lastError || new Error('Failed after multiple attempts');
    }

    function parseCSV(csv) {
        const rows = [];
        let currentRow = [];
        let currentField = '';
        let inQuotes = false;

        csv = csv.replace(/\ufeff/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        for (let i = 0; i < csv.length; i++) {
            const char = csv[i];

            if (char === '"') {
                if (csv[i + 1] === '"' && inQuotes) {
                    currentField += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                currentRow.push(currentField.trim());
                currentField = '';
            } else if (char === '\n' && !inQuotes) {
                currentRow.push(currentField.trim());
                rows.push(currentRow);
                currentRow = [];
                currentField = '';
            } else {
                currentField += char;
            }
        }

        if (currentField.length > 0) currentRow.push(currentField.trim());
        if (currentRow.length > 0) rows.push(currentRow);

        return rows.slice(1)
            .map(row => {
                if (row.length < 8 || !row[0] || !row[6]) return null;

                const question = cleanField(row[0]);
                const choices = [];
                
                for (let i = 1; i <= 5; i++) {
                    const text = cleanField(row[i]);
                    if (text) choices.push({ text, correct: false });
                }

                const correctAnswer = cleanField(row[6]).toUpperCase();
                if (correctAnswer && choices.length > 0) {
                    const correctIndex = correctAnswer.charCodeAt(0) - 65;
                    if (correctIndex >= 0 && correctIndex < choices.length) {
                        choices[correctIndex].correct = true;
                    }
                }

                return {
                    question,
                    choices,
                    explanation: row[7] ? cleanField(row[7]) : null
                };
            })
            .filter(q => q !== null && q.choices.length >= 2);
    }

    // ===== MODALS SYSTEM =====
    function createModal(title, content, hasForm = false) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        
        modal.innerHTML = `
            <div class="modal-content">
                <button class="close-modal" aria-label="Close modal">&times;</button>
                <div class="modal-header">
                    <h2>${title}</h2>
                </div>
                <div class="modal-body">
                    ${content}
                    ${hasForm ? `
                    <form class="modal-form" style="margin-top: 1rem;">
                        <label for="contact-name">Your Name</label>
                        <input type="text" id="contact-name" required>
                        
                        <label for="contact-email">Email Address</label>
                        <input type="email" id="contact-email" required>
                        
                        <label for="contact-message">Message</label>
                        <textarea id="contact-message" required></textarea>
                        
                        <button type="submit" class="form-submit-btn">Send Message</button>
                    </form>
                    ` : ''}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
        
        setTimeout(() => modal.classList.add('active'), 10);
        
        const closeModal = () => {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.remove();
                document.body.style.overflow = '';
            }, 300);
        };
        
        modal.querySelector('.close-modal').addEventListener('click', closeModal);
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        
        document.addEventListener('keydown', function escClose(e) {
            if (e.key === 'Escape') closeModal();
        });
        
        if (hasForm) {
            const form = modal.querySelector('.modal-form');
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                showError('Message sent successfully! (This is a demo)');
                closeModal();
            });
        }
        
        const focusableElements = modal.querySelectorAll('button, [href], input, textarea');
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        
        firstElement.focus();
        
        modal.addEventListener('keydown', (e) => {
            if (e.key !== 'Tab') return;
            
            if (e.shiftKey && document.activeElement === firstElement) {
                e.preventDefault();
                lastElement.focus();
            } else if (!e.shiftKey && document.activeElement === lastElement) {
                e.preventDefault();
                firstElement.focus();
            }
        });
    }
    
    // Footer links
    document.querySelectorAll('footer a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.textContent.toLowerCase();
            
            if (page.includes('about')) {
                createModal('About ClinicQ', `
                    <p>ClinicQ is your ultimate exam revision partner, offering a powerful quiz platform designed specifically for veterinary students preparing for licensure and board exams.</p><br>
                    <p>✅ <strong>High-Yield Questions</strong> – Test your knowledge with expertly crafted questions covering all key topics.</p>  
                    <p>✅ <strong>Personalized Learning</strong> – Focus on weak areas with adaptive quizzes and performance tracking. <i>Under development</i></p>  
                    <p>✅ <strong>Exam-Ready Confidence</strong> – Simulate real test conditions to boost speed and accuracy.</p>  

                    <br><p>Built by a <strong>veterinary professional</strong>, ClinicQ ensures you study <strong>smarter, not harder</strong>—so you can walk into your exam with confidence.</p>  

                    <br><p>🚀 <strong>Start mastering veterinary medicine—one question at a time.</strong></p>                   
                    <div class="features-grid">
                        <div class="feature-item">
                            <strong>Version</strong>
                            <p>1.0.3</p>
                        </div>
                        <div class="feature-item">
                            <strong>Subjects</strong>
                            <p>9 Veterinary Medicine disciplines</p>
                        </div>
                        <div class="feature-item">
                            <strong>Questions</strong>
                            <p>1000+ high-quality items</p>
                        </div>
                    </div>
                `);
            }
            else if (page.includes('contact')) {
                createModal('Contact Us', `
                    <p>Have questions or feedback? We'd love to hear from you.</p>
                    <div class="contact-info">
                        <p><strong>Email:</strong> vleqbanks@gmail.com</p>
                        <p><strong>Support Hours:</strong> Saturday-Wednesday, 7PM-10PM</p>
                    </div>
                `, true);
            }
            else if (page.includes('privacy')) {
                createModal('Privacy Policy', `
                    <div class="privacy-section">
                        <h3>Data Collection</h3>
                        <p>We only store quiz progress locally in your browser. No personal data is collected or shared with third parties.</p>
                    </div>
                    
                    <div class="privacy-section">
                        <h3>Cookies</h3>
                        <p>This app uses localStorage to save your progress, but doesn't use tracking cookies or analytics tools.</p>
                    </div>
                    
                    <div class="privacy-section">
                        <h3>Third Party Services</h3>
                        <p>We load questions from Google Sheets, but don't share any user data with them. All processing happens in your browser.</p>
                    </div>
                `);
            }
        });
    });
    
    // ===== QUIZ STATE MANAGEMENT =====
    const state = {
        currentQuestionIndex: 0,
        score: 0,
        questions: [],
        shuffledQuestions: [],
        answeredQuestions: [],
        totalQuestions: 0,
        totalTime: 0,
        timeLeft: 0,
        timerInterval: null,
        selectedChoice: null,
        currentChoices: [],
        quizStarted: false,
        quizEnded: false,
        hasAnswered: false
    };

    // ===== QUIZ FUNCTIONS =====
    function startTimer() {
        state.timerInterval = setInterval(() => {
            state.timeLeft--;
            elements.timer.textContent = formatTime(state.timeLeft);
            if (state.timeLeft <= 0) endQuiz();
        }, 1000);
    }

    function updateProgressBar() {
        const progress = ((state.currentQuestionIndex + 1) / state.totalQuestions) * 100;
        elements.progressBar.style.width = `${progress}%`;
        elements.progressBar.setAttribute('aria-valuenow', progress);
    }

    function showQuestion() {
        state.hasAnswered = false;
        state.selectedChoice = null;
        
        // Start with hidden elements
        elements.questionContainer.style.opacity = '0';
        elements.choicesContainer.style.opacity = '0';
        
        // Reset UI state
        elements.submitBtn.disabled = true;
        elements.submitBtn.textContent = "Submit";
        elements.feedback.classList.add('hidden');
        
        // Clear previous choices
        elements.choicesContainer.innerHTML = '';
    
        const currentQuestion = state.shuffledQuestions[state.currentQuestionIndex];
        elements.questionElement.textContent = currentQuestion.question;
        elements.currentNumber.textContent = state.currentQuestionIndex + 1;
        updateProgressBar();
    
        state.currentChoices = [...currentQuestion.choices];
        const shuffledChoices = shuffleArray([...currentQuestion.choices]);
        
        shuffledChoices.forEach((choice, index) => {
            const button = document.createElement('button');
            button.className = 'choice-btn';
            button.textContent = `${String.fromCharCode(65 + index)}) ${choice.text}`;
            button.setAttribute('role', 'radio');
            button.setAttribute('aria-checked', 'false');
            button.setAttribute('tabindex', '0');
            
            button.addEventListener('click', () => selectChoice(button, choice));
            button.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    selectChoice(button, choice);
                }
            });
            
            elements.choicesContainer.appendChild(button);
        });
        
        // Trigger reflow and then animate in
        setTimeout(() => {
            elements.questionContainer.style.opacity = '1';
            elements.choicesContainer.style.opacity = '1';
        }, 10);
    }

    function selectChoice(button, choice) {
        if (state.hasAnswered) return;
        
        document.querySelectorAll('.choice-btn').forEach(btn => {
            btn.classList.remove('selected');
            btn.setAttribute('aria-checked', 'false');
        });
        
        button.classList.add('selected');
        button.setAttribute('aria-checked', 'true');
        state.selectedChoice = choice;
        
        // Enable submit button
        elements.submitBtn.disabled = false;
    }

    function checkAnswer() {
        if (!state.selectedChoice || state.hasAnswered) return;
        
        state.hasAnswered = true;
        
        // Disable all choice buttons
        document.querySelectorAll('.choice-btn').forEach(btn => {
            btn.disabled = true;
        });

        const selectedButton = document.querySelector('.choice-btn.selected');
        const currentQuestion = state.shuffledQuestions[state.currentQuestionIndex];
        const correctChoice = state.currentChoices.find(c => c.correct);
        
        // Mark correct/incorrect
        if (state.selectedChoice.correct) {
            selectedButton.classList.add('correct');
            state.score++;
            elements.scoreElement.textContent = state.score;
            showFeedback(true, currentQuestion.explanation);
        } else {
            selectedButton.classList.add('incorrect');
            const buttons = Array.from(elements.choicesContainer.children);
            const correctButton = buttons.find(btn => 
                btn.textContent.includes(correctChoice.text)
            );
            if (correctButton) correctButton.classList.add('correct');
            showFeedback(false, currentQuestion.explanation);
        }

        // Store answer data
        state.answeredQuestions.push({
            question: currentQuestion.question,
            selectedAnswer: state.selectedChoice.text,
            correctAnswer: correctChoice.text,
            isCorrect: state.selectedChoice.correct,
            explanation: currentQuestion.explanation
        });

        // Transform submit button to continue button
        elements.submitBtn.textContent = "Continue";
        elements.submitBtn.removeEventListener('click', checkAnswer);
        elements.submitBtn.addEventListener('click', continueToNextQuestion);
    }

    function continueToNextQuestion() {
        // Scroll to top smoothly
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
        
        elements.feedback.classList.add('hidden');
        elements.submitBtn.textContent = "Submit";
        elements.submitBtn.removeEventListener('click', continueToNextQuestion);
        elements.submitBtn.addEventListener('click', checkAnswer);
        nextQuestion();
    }

    function showFeedback(isCorrect, explanation) {
        const correctAnswer = state.currentChoices.find(c => c.correct);
        
        let feedbackMessage = isCorrect
            ? `Correct! <br> ${explanation || ''}`
            : `Incorrect. The correct answer is: ${correctAnswer.text}. <br> ${explanation || ''}`;

        elements.feedbackText.innerHTML = feedbackMessage;
        elements.feedback.classList.remove('hidden');
        elements.feedback.className = `feedback ${isCorrect ? 'correct' : 'incorrect'}`;
    }

    function nextQuestion() {
        state.currentQuestionIndex++;
        if (state.currentQuestionIndex < state.totalQuestions) {
            showQuestion();
        } else {
            endQuiz();
        }
    }

    function endQuiz() {
        clearInterval(state.timerInterval);
        state.quizEnded = true;
        
        const percentage = ((state.score / state.totalQuestions) * 100).toFixed(1);
        const timeTaken = state.totalTime - state.timeLeft;
        
        elements.finalScore.textContent = state.score;
        elements.maxScore.textContent = state.totalQuestions;
        elements.accuracy.textContent = percentage;
        elements.finalTime.textContent = formatTime(timeTaken);
        elements.endScreen.classList.remove('hidden');
        
        localStorage.setItem('quizResults', JSON.stringify({
            score: state.score,
            totalQuestions: state.totalQuestions,
            timeTaken: timeTaken,
            answeredQuestions: state.answeredQuestions,
            subject: localStorage.getItem('selectedSubject'),
            date: new Date().toISOString()
        }));

        // Setup end screen listeners
        setupEndScreenListeners();
    }

    // ===== UI FUNCTIONS =====
    function showLoading() {
        elements.loadingSpinner.classList.remove('hidden');
        document.body.style.pointerEvents = 'none';
    }

    function hideLoading() {
        elements.loadingSpinner.classList.add('hidden');
        document.body.style.pointerEvents = 'auto';
    }

    function showError(message) {
        elements.errorMessage.textContent = message;
        elements.errorMessage.classList.remove('hidden');
        setTimeout(() => elements.errorMessage.classList.add('hidden'), 5000);
    }

    function reviewQuiz() {
        const results = JSON.parse(localStorage.getItem('quizResults'));
        if (!results) return;
        
        const originalEndContent = elements.endScreen.querySelector('.end-content').outerHTML;
        
        elements.endScreen.innerHTML = `
            <div class="end-content">
                <h2>Quiz Review: ${results.subject}</h2>
                <p class="review-score">Score: ${results.score}/${results.totalQuestions}</p>
                <div class="review-questions">
                    ${results.answeredQuestions.map((q, i) => `
                        <div class="review-item">
                            <p class="review-question">${i+1}. ${q.question}</p>
                            <p class="review-answer ${q.isCorrect ? 'review-correct' : 'review-incorrect'}">
                                Your answer: ${q.selectedAnswer}
                            </p>
                            ${!q.isCorrect ? `
                                <p class="review-correct-answer">
                                    Correct answer: ${q.correctAnswer}
                                </p>
                            ` : ''}
                            ${q.explanation ? `
                                <p class="review-explanation">
                                    <strong>Explanation:</strong> ${q.explanation}
                                </p>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
                <button id="back-to-results" class="quiz-btn">Back to Results</button>
            </div>
        `;
        
        document.getElementById('back-to-results').addEventListener('click', () => {
            elements.endScreen.innerHTML = originalEndContent;
            setupEndScreenListeners();
        });
    }
    
    function setupEndScreenListeners() {
        document.getElementById('review-btn').addEventListener('click', reviewQuiz);
        document.getElementById('new-quiz-btn').addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }

    // ===== DOM ELEMENTS =====
    const elements = {
        quizSubject: document.getElementById('quiz-subject'),
        scoreElement: document.getElementById('score'),
        currentNumber: document.getElementById('current-number'),
        totalQuestions: document.getElementById('total-questions'),
        timer: document.getElementById('timer'),
        submitBtn: document.getElementById('submit-btn'),
        choicesContainer: document.getElementById('choices'),
        questionElement: document.getElementById('question'),
        progressBar: document.getElementById('progress-bar'),
        feedback: document.getElementById('feedback'),
        feedbackText: document.getElementById('feedback-text'),
        endScreen: document.getElementById('end-screen'),
        finalScore: document.getElementById('final-score'),
        maxScore: document.getElementById('max-score'),
        finalTime: document.getElementById('final-time'),
        accuracy: document.getElementById('accuracy'),
        loadingSpinner: document.getElementById('loading-spinner'),
        errorMessage: document.getElementById('error-message'),
        questionContainer: document.querySelector('.question-container'),
        choicesContainer: document.getElementById('choices')
    };

    // ===== EVENT LISTENERS =====
    function setupEventListeners() {
        // Submit button starts with checkAnswer handler
        elements.submitBtn.addEventListener('click', checkAnswer);
        
        // Keyboard support
        document.addEventListener('keydown', (e) => {
            if (state.quizEnded) return;
            
            // Enter key submits answer or continues
            if (e.key === 'Enter') {
                if (!elements.submitBtn.disabled) {
                    elements.submitBtn.click();
                }
            }
            
            // Number keys select answers (1-5)
            if (e.key >= '1' && e.key <= '5') {
                const index = parseInt(e.key) - 1;
                const buttons = elements.choicesContainer.querySelectorAll('.choice-btn');
                if (buttons[index] && !state.hasAnswered) {
                    buttons[index].click();
                }
            }
        });
    }

    // ===== INITIALIZATION =====
    initializeTheme();
    
    if (document.querySelector('.subject-grid')) {
        document.querySelectorAll('.subject-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const subjectBtn = e.target.closest('.subject-btn');
                localStorage.setItem('selectedSubject', subjectBtn.dataset.subject);
                localStorage.setItem('sheetName', encodeURIComponent(subjectBtn.dataset.sheet));
                window.location.href = 'quiz.html';
            });
        });
    }

    if (window.location.pathname.includes('quiz.html')) {
        setupEventListeners();
        
        async function initQuiz() {
            try {
                showLoading();
                
                const quizSubject = localStorage.getItem('selectedSubject');
                const sheetName = decodeURIComponent(localStorage.getItem('sheetName'));
                const SHEET_ID = '1G9h7nG0S1x-O7pPNg0kFBxgkO3VGhS8bUnY_KQ5Fu9U';
                
                if (!quizSubject || !sheetName) {
                    throw new Error('Please select a subject from the main page');
                }

                elements.quizSubject.textContent = quizSubject.replace(/\b\w/g, l => l.toUpperCase());
                elements.loadingSpinner.querySelector('.loading-text').textContent = 
                    `Loading ${quizSubject} questions...`;
                
                const questions = await loadQuestionsWithRetry(SHEET_ID, sheetName, 3);
                
                if (!questions || questions.length === 0) {
                    throw new Error('The question bank is empty or formatted incorrectly');
                }

                state.questions = questions;
                state.shuffledQuestions = shuffleArray([...questions]);
                state.totalQuestions = Math.min(questions.length, 100);
                state.totalTime = state.totalQuestions * 72;
                state.timeLeft = state.totalTime;
                
                elements.totalQuestions.textContent = state.totalQuestions;
                elements.timer.textContent = formatTime(state.timeLeft);
                updateProgressBar();
                
                startTimer();
                showQuestion();
                state.quizStarted = true;
            } catch (error) {
                console.error('Quiz initialization failed:', error);
                showError(error.message);
                
                // Add retry button
                const retryBtn = document.createElement('button');
                retryBtn.textContent = 'Retry';
                retryBtn.className = 'retry-btn';
                retryBtn.addEventListener('click', initQuiz);
                
                elements.errorMessage.appendChild(document.createElement('br'));
                elements.errorMessage.appendChild(retryBtn);
                
                setTimeout(() => {
                    if (!state.quizStarted) {
                        window.location.href = 'index.html';
                    }
                }, 10000);
            } finally {
                hideLoading();
            }
        }

        initQuiz();
    }
});