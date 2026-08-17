import { requireAdmin } from './auth-guard.js';
import { CONFIG } from './config.js';

let currentUser = null;
let currentSupabase = null;

let members = [];
let subscriptions = [];
let classes = [];
let requests = [];

let selectedMember = null;


// ==========================================
// INITIALIZATION
// ==========================================

init();


async function init() {

    const result = await requireAdmin();

    if (!result) {
        return;
    }

    currentUser = result.session.user;
    currentSupabase = result.supabase;

    document.getElementById('adminEmail').textContent =
        currentUser.email || 'ADMIN';


    setupNavigation();
    setupButtons();
    setupModal();
    setupActivationModal();

    await Promise.all([
        loadMembers(),
        loadClasses(),
        loadRequests()
    ]);

    updateStatistics();
}


// ==========================================
// NAVIGATION
// ==========================================

function setupNavigation() {

    const tabs = document.querySelectorAll('.admin-tab');

    tabs.forEach(tab => {

        tab.addEventListener('click', () => {

            const target = tab.dataset.tab;

            tabs.forEach(item => {
                item.classList.remove('active');
            });

            tab.classList.add('active');

            document
                .querySelectorAll('.admin-tab-content')
                .forEach(section => {
                    section.classList.remove('active');
                });

            const targetSection =
                document.getElementById(`${target}Tab`);

            if (targetSection) {
                targetSection.classList.add('active');
            }

        });

    });

}


// ==========================================
// BUTTONS
// ==========================================

function setupButtons() {

    document
        .getElementById('logoutButton')
        .addEventListener('click', logout);


    document
        .getElementById('refreshMembers')
        .addEventListener('click', async () => {

            await loadMembers();
            updateStatistics();

        });


    document
        .getElementById('refreshClasses')
        .addEventListener('click', loadClasses);


    document
        .getElementById('refreshRequests')
        .addEventListener('click', async () => {

            await loadRequests();
            updateStatistics();

        });


    document
        .getElementById('memberSearch')
        .addEventListener('input', renderMembers);


    document
        .getElementById('memberFilter')
        .addEventListener('change', renderMembers);

}


// ==========================================
// LOGOUT
// ==========================================

async function logout() {

    await currentSupabase.auth.signOut();

    window.location.href = 'login.html';

}


// ==========================================
// LOAD MEMBERS
// ==========================================

async function loadMembers() {

    const table = document.getElementById('membersTable');

    table.innerHTML = `
        <tr>
            <td colspan="7" class="table-loading">
                Loading members...
            </td>
        </tr>
    `;


    try {

        const { data: profiles, error: profileError } =
    await currentSupabase
        .from('profiles')
        .select('*')
        .eq('role', 'member')
        .order('joined_at', { ascending: false });


        if (profileError) {
            throw profileError;
        }


        const { data: subscriptionData, error: subscriptionError } =
            await currentSupabase
                .from('subscriptions')
                .select('*');


        if (subscriptionError) {
            throw subscriptionError;
        }


        members = profiles || [];
        subscriptions = subscriptionData || [];


        renderMembers();

    } catch (error) {

        console.error(
            'Failed to load members:',
            error
        );

        table.innerHTML = `
            <tr>
                <td colspan="7" class="table-error">
                    Unable to load members.
                </td>
            </tr>
        `;

    }

}


// ==========================================
// RENDER MEMBERS
// ==========================================

function renderMembers() {

    const table =
        document.getElementById('membersTable');

    const search =
        document
            .getElementById('memberSearch')
            .value
            .trim()
            .toLowerCase();


    const filter =
        document.getElementById('memberFilter').value;


    let rows = members
        .filter(profile => {

            const subscription =
                getSubscription(profile.id);


            const name =
                profile.full_name || 'Unknown Member';


            const email =
                profile.email || '';


            const matchesSearch =
                !search ||
                name.toLowerCase().includes(search) ||
                email.toLowerCase().includes(search);


            const status =
                getSubscriptionStatus(subscription);


            const matchesFilter =
                filter === 'all' ||
                status === filter;


            return matchesSearch && matchesFilter;

        });


    if (!rows.length) {

        table.innerHTML = `
            <tr>
                <td colspan="7" class="empty-table">
                    No members found.
                </td>
            </tr>
        `;

        return;

    }


    table.innerHTML = rows
        .map(profile => {

            const subscription =
                getSubscription(profile.id);

            const status =
                getSubscriptionStatus(subscription);

            const days =
                getDaysRemaining(subscription);

            const endDate =
                getEndDate(subscription);

            const plan =
                subscription?.plan_name ||
                'Unavailable';


            return `

                <tr>

                    <td data-label="Member">

                        <div class="member-cell">

                            <div class="member-avatar">
                                ${getInitials(profile.full_name)}
                            </div>

                            <div>

                                <strong>
                                    ${escapeHtml(
                                        profile.full_name ||
                                        'Unknown Member'
                                    )}
                                </strong>

                                <small>
                                    ${escapeHtml(
                                        profile.email ||
                                        ''
                                    )}
                                </small>

                            </div>

                        </div>

                    </td>


                    <td data-label="Plan">
                        ${escapeHtml(plan)}
                    </td>


                    <td data-label="Status">

                        <span
                            class="status-pill status-${status}"
                        >
                            ${status.toUpperCase()}
                        </span>

                    </td>


                    <td data-label="Ends">
                        ${endDate}
                    </td>


                    <td data-label="Days" class="days-cell">
                        ${days}
                    </td>


                    <td data-label="Remaining" class="days-cell">
                        ${formatRemaining(subscription)}
                    </td>


                    <td data-label="Action">

                        <button
                            class="table-action"
                            data-member-id="${profile.id}"
                        >
                            VIEW
                        </button>

                    </td>

                </tr>

            `;

        })
        .join('');


    document
        .querySelectorAll('.table-action')
        .forEach(button => {

            button.addEventListener(
                'click',
                () => {

                    const memberId =
                        button.dataset.memberId;

                    openMemberModal(memberId);

                }
            );

        });

}


// ==========================================
// GET SUBSCRIPTION
// ==========================================

function getSubscription(userId) {

    return subscriptions.find(
        subscription =>
            subscription.user_id === userId
    );

}


// ==========================================
// STATUS
// ==========================================

function getSubscriptionStatus(subscription) {
    if (!subscription) {
        return 'no-plan';
    }

    if (subscription.status) {
        return subscription.status.toLowerCase();
    }

    const days = getDaysRemaining(subscription);

    if (days <= 0) {
        return 'expired';
    }

    if (days <= 7) {
        return 'warning';
    }

    return 'active';
}


// ==========================================
// DAYS REMAINING
// ==========================================

function getDaysRemaining(subscription) {

    if (!subscription) {
        return '—';
    }


    const end =
        subscription.end_date ||
        subscription.expires_at;


    if (!end) {
        return '—';
    }


    const endDate =
        new Date(end);

    const now =
        new Date();


    const difference =
        endDate.getTime() -
        now.getTime();


    return Math.max(
        0,
        Math.ceil(
            difference /
            (1000 * 60 * 60 * 24)
        )
    );

}


// ==========================================
// END DATE
// ==========================================

function getEndDate(subscription) {

    if (!subscription) {
        return '—';
    }


    const date =
        subscription.end_date ||
        subscription.expires_at;


    if (!date) {
        return '—';
    }


    return new Date(date)
        .toLocaleDateString(
            'en-GB',
            {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            }
        );

}


// ==========================================
// REMAINING (formatted months + days)
// ==========================================

function formatRemaining(subscription) {

    const days = getDaysRemaining(subscription);

    if (days === '—') {
        return '—';
    }

    if (days <= 0) {
        return 'EXPIRED';
    }

    const months = Math.floor(days / 30);
    const remainingDays = days % 30;

    if (months === 0) {
        return `${remainingDays} DAY${remainingDays === 1 ? '' : 'S'}`;
    }

    if (remainingDays === 0) {
        return `${months} MONTH${months === 1 ? '' : 'S'}`;
    }

    return `${months} MONTH${months === 1 ? '' : 'S'} ${remainingDays} DAY${remainingDays === 1 ? '' : 'S'}`;

}


// ==========================================
// STATISTICS
// ==========================================

function updateStatistics() {

    document.getElementById(
        'totalMembers'
    ).textContent = members.length;


    let active = 0;
    let expiring = 0;


    members.forEach(member => {

        const subscription =
            getSubscription(member.id);

        const status =
            getSubscriptionStatus(subscription);


        if (status === 'active') {
            active++;
        }


        if (status === 'warning') {
            expiring++;
        }

    });


    document.getElementById(
        'activeMembers'
    ).textContent = active;


    document.getElementById(
        'expiringMembers'
    ).textContent = expiring;


    const pending =
        requests.filter(
            request =>
                !request.status ||
                request.status.toLowerCase() === 'pending'
        ).length;


    document.getElementById(
        'pendingRequests'
    ).textContent = pending;

}


// ==========================================
// LOAD CLASSES
// ==========================================

async function loadClasses() {

    const container =
        document.getElementById(
            'adminClassList'
        );


    container.innerHTML = `
        <div class="empty-state">
            Loading classes...
        </div>
    `;


    try {

        const { data, error } =
            await currentSupabase
                .from('classes')
                .select('*')
                .order('day_of_week')
                .order('start_time');


        if (error) {
            throw error;
        }


        classes = data || [];


        if (!classes.length) {

            container.innerHTML = `
                <div class="empty-state">
                    No classes have been added yet.
                </div>
            `;

            return;

        }


        container.innerHTML =
            classes.map((item, index) => `

                <div class="admin-class-card">

                    <div class="class-number">
                        ${String(index + 1).padStart(2, '0')}
                    </div>

                    <div class="class-main">

                        <div class="class-eyebrow">
                            ${escapeHtml(
                                item.day_of_week ||
                                'DAY'
                            )}
                        </div>

                        <h3>
                            ${escapeHtml(
                                item.name ||
                                'Unnamed Class'
                            )}
                        </h3>

                        <p>
                            Coach
                            ${escapeHtml(
                                item.instructor ||
                                'TBA'
                            )}
                        </p>

                    </div>

                    <div class="class-time">

                        ${formatTime(
                            item.start_time
                        )}

                    </div>

                </div>

            `).join('');

    } catch (error) {

        console.error(
            'Failed to load classes:',
            error
        );


        container.innerHTML = `
            <div class="empty-state error">
                Unable to load classes.
            </div>
        `;

    }

}


// ==========================================
// LOAD REQUESTS
// ==========================================

async function loadRequests() {

    const table =
        document.getElementById(
            'requestsTable'
        );


    table.innerHTML = `
        <tr>
            <td colspan="6" class="table-loading">
                Loading requests...
            </td>
        </tr>
    `;


    try {

        const { data, error } =
            await currentSupabase
                .from('plan_requests')
                .select('*')
                .order('created_at', {
                    ascending: false
                });


        if (error) {
            throw error;
        }


        requests = data || [];


        renderRequests();

    } catch (error) {

        console.error(
            'Failed to load requests:',
            error
        );


        table.innerHTML = `
            <tr>
                <td colspan="6" class="table-error">
                    Unable to load requests.
                </td>
            </tr>
        `;

    }

}


// ==========================================
// RENDER REQUESTS
// ==========================================

function renderRequests() {

    const table =
        document.getElementById(
            'requestsTable'
        );


    if (!requests.length) {

        table.innerHTML = `
            <tr>
                <td colspan="6" class="empty-table">
                    No plan requests yet.
                </td>
            </tr>
        `;

        return;

    }


    table.innerHTML =
        requests.map(request => {

            const profile =
                members.find(
                    member =>
                        member.id === request.user_id
                );


            const name =
                profile?.full_name ||
                'Unknown Member';


            const email =
                profile?.email ||
                '';


            const status =
                request.status ||
                'pending';


            const date =
                request.created_at
                    ? new Date(
                        request.created_at
                    ).toLocaleDateString(
                        'en-GB'
                    )
                    : '—';


            return `

                <tr>

                    <td data-label="Member">

                        <div class="request-member">

                            <strong>
                                ${escapeHtml(name)}
                            </strong>

                            <small>
                                ${escapeHtml(email)}
                            </small>

                        </div>

                    </td>


                    <td data-label="Request">
                        ${escapeHtml(
                            request.request_type ||
                            'renewal'
                        )}
                    </td>


                    <td data-label="Plan">
                        ${escapeHtml(
                            request.requested_plan ||
                            'Standard'
                        )}
                    </td>


                    <td data-label="Status">

                        <span
                            class="status-pill status-${status.toLowerCase()}"
                        >
                            ${status.toUpperCase()}
                        </span>

                    </td>


                    <td data-label="Date">
                        ${date}
                    </td>


                    <td data-label="Action">

                        ${
                            status.toLowerCase() ===
                            'pending'

                            ?

                            `
                                <button
                                    class="table-action approve-request"
                                    data-request-id="${request.id}"
                                >
                                    APPROVE
                                </button>
                            `

                            :

                            `<span class="request-done">DONE</span>`
                        }

                    </td>

                </tr>

            `;

        }).join('');


    document
        .querySelectorAll('.approve-request')
        .forEach(button => {

            button.addEventListener(
                'click',
                () => {

                    approveRequest(
                        button.dataset.requestId
                    );

                }
            );

        });

}


// ==========================================
// APPROVE REQUEST
// ==========================================

async function approveRequest(requestId) {

    const button =
        document.querySelector(
            `[data-request-id="${requestId}"]`
        );

    if (button) {
        button.disabled = true;
        button.textContent = 'ACTIVATING...';
    }

    try {

        const request =
            requests.find(r => r.id === requestId);

        if (!request) {
            throw new Error('Request not found');
        }

        // Default to a 30-day cycle starting today.
        // Adjust the row manually in Supabase afterward for a different length.
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);

        const { error: subError } =
            await currentSupabase
                .from('subscriptions')
                .upsert({
                    user_id: request.user_id,
                    plan_name: request.requested_plan || 'Standard',
                    status: 'active',
                    start_date: startDate.toISOString(),
                    end_date: endDate.toISOString(),
                    days_remaining: 30,
                    progress_percentage: 0
                }, { onConflict: 'user_id' });

        if (subError) {
            throw subError;
        }

        const { error: requestError } =
            await currentSupabase
                .from('plan_requests')
                .update({ status: 'fulfilled' })
                .eq('id', requestId);

        if (requestError) {
            throw requestError;
        }

        showMessage(
            'Plan activated and member subscription created.',
            'success'
        );

        await Promise.all([loadMembers(), loadRequests()]);

        updateStatistics();

    } catch (error) {

        console.error(error);

        showMessage(
            'Could not activate the plan.',
            'error'
        );

        if (button) {
            button.disabled = false;
            button.textContent = 'APPROVE';
        }

    }

}


// ==========================================
// MEMBER MODAL
// ==========================================

function setupModal() {

    const modal =
        document.getElementById(
            'memberModal'
        );


    document
        .getElementById('closeMemberModal')
        .addEventListener(
            'click',
            closeMemberModal
        );


    document
        .querySelector(
            '.admin-modal-backdrop'
        )
        .addEventListener(
            'click',
            closeMemberModal
        );


    document
        .getElementById('markExpiringButton')
        .addEventListener(
            'click',
            markSelectedMemberExpiring
        );


    document
        .getElementById('syncMemberButton')
        .addEventListener(
            'click',
            syncSelectedMember
        );


    document.addEventListener(
        'keydown',
        event => {

            if (
                event.key === 'Escape' &&
                modal.classList.contains('open')
            ) {
                closeMemberModal();
            }

        }
    );

}


// ==========================================
// OPEN MEMBER MODAL
// ==========================================

function openMemberModal(memberId) {

    const profile =
        members.find(
            member =>
                member.id === memberId
        );


    if (!profile) {
        return;
    }


    const subscription =
        getSubscription(memberId);


    selectedMember = {
        profile,
        subscription
    };


    document.getElementById(
        'modalMemberName'
    ).textContent =
        profile.full_name ||
        'MEMBER';


    document.getElementById(
        'modalMemberEmail'
    ).textContent =
        profile.email ||
        '—';


    document.getElementById(
        'modalMemberPlan'
    ).textContent =
        subscription?.plan_name ||
        'Unavailable';


    document.getElementById(
        'modalMemberStatus'
    ).textContent =
        getSubscriptionStatus(
            subscription
        ).toUpperCase();


    document.getElementById(
        'modalMemberEnd'
    ).textContent =
        getEndDate(subscription);


    const modal =
        document.getElementById(
            'memberModal'
        );


    modal.classList.add('open');
    modal.setAttribute(
        'aria-hidden',
        'false'
    );

}


// ==========================================
// CLOSE MODAL
// ==========================================

function closeMemberModal() {

    const modal =
        document.getElementById(
            'memberModal'
        );


    modal.classList.remove('open');

    modal.setAttribute(
        'aria-hidden',
        'true'
    );


    selectedMember = null;

}


// ==========================================
// MARK MEMBER EXPIRING
// ==========================================

async function markSelectedMemberExpiring() {

    if (!selectedMember) {
        return;
    }


    const userId =
        selectedMember.profile.id;


    const button =
        document.getElementById(
            'markExpiringButton'
        );


    button.disabled = true;
    button.textContent = 'UPDATING...';


    try {

        const { error } =
            await currentSupabase
                .from('subscriptions')
                .update({
                    status: 'warning'
                })
                .eq('user_id', userId);


        if (error) {
            throw error;
        }


        showMessage(
            'Membership marked as expiring.',
            'success'
        );


        closeMemberModal();

        await loadMembers();

        updateStatistics();

    } catch (error) {

        console.error(error);

        showMessage(
            'Could not update membership.',
            'error'
        );

    } finally {

        button.disabled = false;
        button.textContent =
            'MARK EXPIRING';

    }

}


// ==========================================
// SYNC MEMBER
// ==========================================

async function syncSelectedMember() {

    if (!selectedMember) {
        return;
    }


    const button =
        document.getElementById(
            'syncMemberButton'
        );


    button.disabled = true;
    button.textContent = 'SYNCING...';


    try {

        const response =
            await fetch(
                `${CONFIG.WORKER_URL}/api/admin/sync`,
                {
                    method: 'POST',

                    headers: {
                        'Content-Type':
                            'application/json'
                    },

                    body: JSON.stringify({
                        user_id:
                            selectedMember.profile.id
                    })
                }
            );


        if (!response.ok) {
            throw new Error(
                'Sync request failed'
            );
        }


        showMessage(
            'Membership synchronization triggered.',
            'success'
        );


        await loadMembers();

        updateStatistics();


    } catch (error) {

        console.error(
            'Sync failed:',
            error
        );


        showMessage(
            'Could not sync membership. Check the Worker endpoint.',
            'error'
        );

    } finally {

        button.disabled = false;

        button.textContent =
            'SYNC MEMBERSHIP';

    }

}


// ==========================================
// ACTIVATION MODAL
// ==========================================

function setupActivationModal() {

    const modal = document.getElementById('activationModal');

    document
        .getElementById('activateMemberButton')
        .addEventListener('click', openActivationModal);

    document
        .getElementById('closeActivationModal')
        .addEventListener('click', closeActivationModal);

    document
        .getElementById('cancelActivationButton')
        .addEventListener('click', closeActivationModal);

    document
        .querySelector('#activationModal .admin-modal-backdrop')
        .addEventListener('click', closeActivationModal);

    document
        .getElementById('membershipDays')
        .addEventListener('input', updateActivationPreview);

    document
        .getElementById('confirmActivationButton')
        .addEventListener('click', confirmActivation);

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modal.classList.contains('open')) {
            closeActivationModal();
        }
    });

}


function openActivationModal() {

    if (!selectedMember) {
        return;
    }

    const { profile, subscription } = selectedMember;

    document.getElementById('activationAvatar').textContent =
        getInitials(profile.full_name);

    document.getElementById('activationMemberName').textContent =
        profile.full_name || 'MEMBER';

    document.getElementById('activationMemberPlan').textContent =
        (subscription?.plan_name || 'STANDARD') + ' PLAN';

    document.getElementById('membershipDays').value = 30;
    document.getElementById('activationError').textContent = '';

    updateActivationPreview();

    // Close the member modal underneath so only one is interactive at a time
    document.getElementById('memberModal').classList.remove('open');
    document.getElementById('memberModal').setAttribute('aria-hidden', 'true');

    const modal = document.getElementById('activationModal');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');

}


function closeActivationModal() {

    const modal = document.getElementById('activationModal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');

}


function updateActivationPreview() {

    const days = parseInt(document.getElementById('membershipDays').value, 10) || 0;

    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + days);

    document.getElementById('activationStartDate').textContent =
        start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    document.getElementById('activationEndDate').textContent =
        end.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

}


async function confirmActivation() {

    if (!selectedMember) {
        return;
    }

    const errorBox = document.getElementById('activationError');
    const days = parseInt(document.getElementById('membershipDays').value, 10);

    if (!days || days < 1) {
        errorBox.textContent = 'Enter a valid number of days.';
        return;
    }

    errorBox.textContent = '';

    const button = document.getElementById('confirmActivationButton');
    button.disabled = true;
    button.textContent = 'ACTIVATING...';

    try {

        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + days);

        const { error } =
            await currentSupabase
                .from('subscriptions')
                .upsert({
                    user_id: selectedMember.profile.id,
                    plan_name: selectedMember.subscription?.plan_name || 'Standard',
                    status: 'active',
                    start_date: startDate.toISOString(),
                    end_date: endDate.toISOString(),
                    days_remaining: days,
                    progress_percentage: 0
                }, { onConflict: 'user_id' });

        if (error) {
            throw error;
        }

        showMessage('Membership activated.', 'success');

        closeActivationModal();
        selectedMember = null;

        await loadMembers();
        updateStatistics();

    } catch (error) {

        console.error(error);
        errorBox.textContent = 'Could not activate membership — try again.';

    } finally {

        button.disabled = false;
        button.textContent = 'ACTIVATE MEMBERSHIP';

    }

}


// ==========================================
// MESSAGE
// ==========================================

function showMessage(
    message,
    type = 'success'
) {

    const element =
        document.getElementById(
            'adminMessage'
        );


    element.textContent = message;

    element.className =
        `admin-message visible ${type}`;


    clearTimeout(
        window.adminMessageTimer
    );


    window.adminMessageTimer =
        setTimeout(() => {

            element.classList.remove(
                'visible'
            );

        }, 4000);

}


// ==========================================
// HELPERS
// ==========================================

function getInitials(name) {

    if (!name) {
        return 'T';
    }


    const parts =
        name
            .trim()
            .split(/\s+/)
            .slice(0, 2);


    return parts
        .map(
            part =>
                part
                    .charAt(0)
                    .toUpperCase()
        )
        .join('');

}


function formatTime(time) {

    if (!time) {
        return '—';
    }


    const parts =
        time.split(':');


    let hours =
        parseInt(parts[0], 10);


    const minutes =
        parts[1] || '00';


    const suffix =
        hours >= 12
            ? 'PM'
            : 'AM';


    hours =
        hours % 12 || 12;


    return `${String(hours).padStart(2, '0')}:${minutes} ${suffix}`;

}


function escapeHtml(value) {

    const div =
        document.createElement('div');

    div.textContent =
        value ?? '';

    return div.innerHTML;

}