import { requireMember } from './auth-guard.js';
import { CONFIG } from './config.js';


let currentUser = null;
let currentSupabase = null;
let currentSubscription = null;


init();


/* ============================================================
   INITIALIZATION
============================================================ */

async function init() {

    const result = await requireMember();

    if (!result) {
        return;
    }


    currentUser = result.session.user;
    currentSupabase = result.supabase;


    /* ---------------------------------------------
       USER NAME
    --------------------------------------------- */

    const fullName = result.profile?.full_name || 'MEMBER';

    const firstName = fullName
        .trim()
        .split(/\s+/)[0]
        .toUpperCase();


    const memberName = document.getElementById('memberName');

    if (memberName) {
        memberName.textContent = firstName;
    }


    /* ---------------------------------------------
       USER EMAIL
    --------------------------------------------- */

    const emailElement = document.getElementById('userEmail');
if (emailElement) {
    emailElement.textContent = currentUser.email || '';
}

renderAvatar(result.profile?.avatar_url, firstName);
setupAvatarUpload();

    /* ---------------------------------------------
       LOGOUT
    --------------------------------------------- */

    document
        .getElementById('logoutButton')
        .addEventListener('click', async () => {

            await currentSupabase.auth.signOut();

            window.location.href = 'login.html';

        });


    /* ---------------------------------------------
       LOAD DASHBOARD DATA
    --------------------------------------------- */

    await loadSubscription();

    await loadClasses();


    setupRenewButton();

    setupChat();
}


/* ============================================================
   SUBSCRIPTION
============================================================ */

async function loadSubscription() {

    try {

        const response = await fetch(
            `${CONFIG.WORKER_URL}/api/subscription`,
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json'
                },

                body: JSON.stringify({
                    user_id: currentUser.id
                })
            }
        );


        if (!response.ok) {
            throw new Error('Subscription request failed');
        }


        const data = await response.json();

        currentSubscription = data;

        renderSubscription(data);

    } catch (error) {

        console.error(
            'Could not load subscription:',
            error
        );

        document.getElementById(
            'daysRemaining'
        ).textContent = '—';

    }
}


/* ============================================================
   RENDER SUBSCRIPTION
============================================================ */

function renderSubscription(data) {

    const {
        days_remaining,
        status,
        progress_percentage
    } = data;


    /* ---------------------------------------------
       PLAN
    --------------------------------------------- */

    document.getElementById(
        'planName'
    ).textContent =
        data.plan_name || 'UNAVAILABLE';


    /* ---------------------------------------------
       DAYS
    --------------------------------------------- */

    document.getElementById(
        'daysRemaining'
    ).textContent =
        status === 'expired'
            ? '0'
            : days_remaining ?? '—';


    /* ---------------------------------------------
       STATUS
    --------------------------------------------- */

    const badge =
        document.getElementById('statusBadge');


    badge.textContent =
        status
            ? status.toUpperCase()
            : '—';


    badge.className =
        `membership-status badge-${status || 'unknown'}`;


    /* ---------------------------------------------
       END DATE
    --------------------------------------------- */

    const endDate =
        document.getElementById('endDate');


    if (data.end_date) {

        endDate.textContent =
            formatDate(data.end_date);

    } else {

        endDate.textContent = '—';

    }


    /* ---------------------------------------------
       PROGRESS RING
    --------------------------------------------- */

    const circumference =
        2 * Math.PI * 74;


    const percentage =
        Math.max(
            0,
            Math.min(
                100,
                Number(progress_percentage) || 0
            )
        );


    const offset =
        circumference -
        (percentage / 100) * circumference;


    const ring =
        document.getElementById('ringFill');


    ring.style.strokeDasharray =
        circumference;


    ring.style.strokeDashoffset =
        circumference;


    ring.classList.remove(
        'status-active',
        'status-warning',
        'status-expired'
    );


    if (status) {

        ring.classList.add(
            `status-${status}`
        );

    }


    requestAnimationFrame(() => {

        requestAnimationFrame(() => {

            ring.style.strokeDashoffset =
                offset;

        });

    });


    /* ---------------------------------------------
       RENEW BUTTON
    --------------------------------------------- */

    const renewButton =
        document.getElementById('renewButton');


    if (
        status === 'warning' ||
        status === 'expired'
    ) {

        renewButton.style.display =
            'flex';

    } else {

        renewButton.style.display =
            'none';

    }
}


function renderAvatar(avatarUrl, name) {
    const img = document.getElementById('avatarImage');
    const initial = document.getElementById('avatarInitial');

    if (avatarUrl) {
        img.src = avatarUrl;
        img.style.display = 'block';
        initial.style.display = 'none';
    } else {
        img.style.display = 'none';
        initial.style.display = 'block';
        initial.textContent = (name || '?').charAt(0).toUpperCase();
    }
}

function setupAvatarUpload() {
    const button = document.getElementById('avatarButton');
    const input = document.getElementById('avatarInput');
    const skeleton = document.getElementById('avatarSkeleton');
    const img = document.getElementById('avatarImage');
    const initial = document.getElementById('avatarInitial');

    button.addEventListener('click', () => input.click());

    input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('Please choose an image file.');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            alert('Image must be under 5MB.');
            return;
        }

        skeleton.style.display = 'block';
        img.style.display = 'none';
        initial.style.display = 'none';

        const ext = file.name.split('.').pop();
        const path = `${currentUser.id}/avatar.${ext}`;

        const { error: uploadError } = await currentSupabase
            .storage
            .from('avatars')
            .upload(path, file, { upsert: true });

        if (uploadError) {
            console.error('Avatar upload failed:', uploadError.message);
            skeleton.style.display = 'none';
            renderAvatar(null, currentUser.email);
            alert('Upload failed — try again.');
            return;
        }

        const { data: urlData } = currentSupabase
            .storage
            .from('avatars')
            .getPublicUrl(path);

        // Cache-bust so the new image shows immediately instead of a stale cached version
        const freshUrl = `${urlData.publicUrl}?t=${Date.now()}`;

        await currentSupabase
            .from('profiles')
            .update({ avatar_url: freshUrl })
            .eq('id', currentUser.id);

        skeleton.style.display = 'none';
        renderAvatar(freshUrl, currentUser.email);
    });
}

/* ============================================================
   RENEWAL
============================================================ */

function setupRenewButton() {

    const button =
        document.getElementById(
            'renewButton'
        );


    const message =
        document.getElementById(
            'renewMessage'
        );


    button.addEventListener(
        'click',
        async () => {

            button.disabled = true;

            button.innerHTML =
                'SUBMITTING...';


            const {
                error
            } = await currentSupabase
                .from('plan_requests')
                .insert({

                    user_id:
                        currentUser.id,

                    requested_plan:
                        currentSubscription?.plan_name ||
                        'Standard',

                    request_type:
                        'renewal'

                });


            if (error) {

                console.error(error);

                message.textContent =
                    'Something went wrong — try again.';

                button.disabled = false;

                button.innerHTML =
                    'REQUEST RENEWAL <span>↗</span>';

                return;
            }


            button.innerHTML =
                'REQUEST SENT ✓';

            message.textContent =
                'Your renewal request has been sent.';
        }
    );
}


/* ============================================================
   CLASSES
============================================================ */

async function loadClasses() {

    const container =
        document.getElementById(
            'classList'
        );


    const {
        data,
        error
    } = await currentSupabase
        .from('classes')
        .select('*')
        .order('day_of_week');


    if (
        error ||
        !data ||
        data.length === 0
    ) {

        container.innerHTML = `
            <div class="schedule-loading">
                No classes available right now.
            </div>
        `;

        return;
    }


    container.innerHTML =
        data.map(classItem => `

            <div class="class-item">

                <div>

                    <div class="class-item-name">
                        ${escapeHtml(
                            classItem.name
                        )}
                    </div>

                    <div class="class-item-meta">
                        ${escapeHtml(
                            classItem.instructor || ''
                        )}
                        ·
                        ${escapeHtml(
                            classItem.day_of_week || ''
                        )}
                    </div>

                </div>


                <div class="class-item-time">
                    ${formatTime(
                        classItem.start_time
                    )}
                </div>

            </div>

        `).join('');
}


/* ============================================================
   TITAN AI CHAT
============================================================ */

function setupChat() {

    const toggle =
        document.getElementById(
            'chatToggle'
        );


    const drawer =
        document.getElementById(
            'chatDrawer'
        );


    const closeButton =
        document.getElementById(
            'chatClose'
        );


    const form =
        document.getElementById(
            'chatForm'
        );


    const input =
        document.getElementById(
            'chatInput'
        );


    const messages =
        document.getElementById(
            'chatMessages'
        );


    /* ---------------------------------------------
       OPEN
    --------------------------------------------- */

    toggle.addEventListener(
        'click',
        () => {

            const isOpen =
                drawer.classList.toggle(
                    'open'
                );


            drawer.setAttribute(
                'aria-hidden',
                String(!isOpen)
            );


            if (isOpen) {

                setTimeout(() => {
                    input.focus();
                }, 200);

            }
        }
    );


    /* ---------------------------------------------
       CLOSE
    --------------------------------------------- */

    closeButton.addEventListener(
        'click',
        () => {

            drawer.classList.remove(
                'open'
            );

            drawer.setAttribute(
                'aria-hidden',
                'true'
            );
        }
    );


    /* ---------------------------------------------
       QUICK ACTIONS
    --------------------------------------------- */

    document
        .querySelectorAll('.quick-action')
        .forEach(button => {

            button.addEventListener(
                'click',
                () => {

                    const message =
                        button.dataset.message;

                    if (!message) {
                        return;
                    }

                    input.value =
                        message;

                    input.focus();
                }
            );

        });


    /* ---------------------------------------------
       SEND MESSAGE
    --------------------------------------------- */

    form.addEventListener(
        'submit',
        async event => {

            event.preventDefault();


            const text =
                input.value.trim();


            if (!text) {
                return;
            }


            /* User message */

            appendMessage(
                text,
                'user'
            );


            input.value = '';


            /* Typing message */

            const typingMessage =
                appendMessage(
                    'TITAN AI is thinking...',
                    'bot'
                );


            try {

                const response =
                    await fetch(
                        `${CONFIG.WORKER_URL}/api/chat`,
                        {
                            method: 'POST',

                            headers: {
                                'Content-Type':
                                    'application/json'
                            },

                            body: JSON.stringify({

                                user_id:
                                    currentUser.id,

                                message:
                                    text

                            })
                        }
                    );


                if (!response.ok) {
                    throw new Error(
                        'Chat request failed'
                    );
                }


                const data =
                    await response.json();


                typingMessage.querySelector(
                    '.message-content'
                ).textContent =
                    data.reply ||
                    "Sorry, I couldn't process that right now.";


            } catch (error) {

                console.error(
                    'Chat error:',
                    error
                );


                typingMessage.querySelector(
                    '.message-content'
                ).textContent =
                    'Sorry, something went wrong. Please try again.';
            }


            scrollChatToBottom();
        }
    );


    /* ---------------------------------------------
       MESSAGE CREATOR
    --------------------------------------------- */

    function appendMessage(
        text,
        role
    ) {

        const wrapper =
            document.createElement(
                'div'
            );


        wrapper.className =
            `ai-message ai-message-${role}`;


        const avatar =
            document.createElement(
                'div'
            );


        avatar.className =
            'message-avatar';


        avatar.textContent =
            role === 'bot'
                ? 'T'
                : 'YOU';


        const content =
            document.createElement(
                'div'
            );


        content.className =
            'message-content';


        content.textContent =
            text;


        wrapper.appendChild(
            avatar
        );


        wrapper.appendChild(
            content
        );


        messages.appendChild(
            wrapper
        );


        scrollChatToBottom();


        return wrapper;
    }


    function scrollChatToBottom() {

        requestAnimationFrame(() => {

            messages.scrollTop =
                messages.scrollHeight;

        });

    }
}


/* ============================================================
   HELPERS
============================================================ */

function escapeHtml(value) {

    const div =
        document.createElement(
            'div'
        );

    div.textContent =
        value ?? '';

    return div.innerHTML;
}


function formatDate(value) {

    if (!value) {
        return '—';
    }


    const date =
        new Date(value);


    if (Number.isNaN(date.getTime())) {
        return value;
    }


    return date.toLocaleDateString(
        'en-US',
        {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        }
    );
}


function formatTime(value) {

    if (!value) {
        return '—';
    }


    /*
       Handles Supabase values such as:

       17:30:00

       06:00:00
    */

    const parts =
        value.split(':');


    if (parts.length < 2) {
        return value;
    }


    let hour =
        parseInt(
            parts[0],
            10
        );


    const minute =
        parts[1];


    const suffix =
        hour >= 12
            ? 'PM'
            : 'AM';


    hour =
        hour % 12 || 12;


    return `${String(hour).padStart(2, '0')}:${minute} ${suffix}`;
}