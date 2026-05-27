const SCHOOL_HOURS = { start: '08:00', end: '17:00' };
const MIN_ADVANCE_HOURS = 24;
const MAX_STUDENT_BOOKING_HOURS = 5;
const MAX_STUDENT_BOOKINGS_PER_WEEK = 2;
const PASSWORD_UPDATE_TIMEOUT_MS = 15000;
const AUTH_EMAIL_DOMAIN = 'aup.edu.ph';
const MOBILE_BREAKPOINT = 768;
const MOBILE_VIEW_OPTIONS = new Set(['timeGridWeek', 'dayGridMonth', 'multiMonthYear', 'listWeek']);
const ROOM_NAME = 'CSC Conference Room';
const ACTIVE_STATUSES = ['confirmed', 'completed', 'blocked'];
const SCHEDULE_STATE_KEYS = [
  'reservations',
  'blockedTimes',
  'activityLogs',
  'adminRequests',
  'passwordResetRequests'
];
const EMPTY_ADMIN_REQUESTS =
  '<div class="activity-item"><strong>No pending admin requests</strong><p>Student accounts can still be created from the login page.</p></div>';
const EMPTY_PASSWORD_RESETS =
  '<div class="activity-item"><strong>No pending password reset requests</strong><p>Forgotten password requests will appear here.</p></div>';
const EMPTY_ACTIVITY_LOG =
  '<div class="activity-item"><strong>No activity yet</strong><p>Reservation actions will appear here.</p></div>';

const state = {
  calendar: null,
  miniCalendarDate: new Date(),
  currentUser: null,
  profile: null,
  reservations: [],
  blockedTimes: [],
  activityLogs: [],
  adminRequests: [],
  passwordResetRequests: [],
  pendingDeleteId: null,
  pendingAgreementFormData: null,
  searchTerm: '',
  filters: {
    mine: false,
    statuses: new Set(ACTIVE_STATUSES)
  }
};

const els = {};

document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
  cacheElements();
  bindStaticEvents();
  await initializeSession();
  await renderAuthState();
}

function cacheElements() {
  [
    'calendar',
    'calendarTitle',
    'todayButton',
    'prevButton',
    'nextButton',
    'viewSelector',
    'searchInput',
    'searchWrap',
    'searchToggle',
    'printButton',
    'profileInitials',
    'profileName',
    'sidebar',
    'mobileMenuButton',
    'mobileScrim',
    'createReservationButton',
    'availabilityStatus',
    'availabilityDetail',
    'miniCalendar',
    'miniCalendarTitle',
    'miniPrevButton',
    'miniNextButton',
    'myReservationsFilter',
    'authScreen',
    'appShell',
    'authSetupNotice',
    'loginForm',
    'loginStudentNumber',
    'loginPassword',
    'registerForm',
    'registerStudentNumber',
    'registerPassword',
    'registerFullName',
    'registerDepartment',
    'registerAccountType',
    'forgotPasswordButton',
    'forgotPasswordCloseButton',
    'forgotPasswordModal',
    'forgotPasswordForm',
    'forgotStudentNumber',
    'forgotFullName',
    'forgotDepartment',
    'forgotMessage',
    'changePasswordModal',
    'changePasswordForm',
    'newPassword',
    'confirmNewPassword',
    'changePasswordMessage',
    'changePasswordButton',
    'logoutButton',
    'reservationModal',
    'reservationCloseButton',
    'reservationForm',
    'reservationModalTitle',
    'reservationId',
    'reservationDate',
    'reservationStart',
    'reservationEnd',
    'reservationStatus',
    'reservationType',
    'reservationOrganization',
    'reservationPeople',
    'reservationPurpose',
    'reservationReservedBy',
    'deleteReservationButton',
    'saveReservationButton',
    'agreementModal',
    'agreementCloseButton',
    'agreementCancelButton',
    'agreementSubmitButton',
    'agreeRules',
    'agreePrivacy',
    'agreeCommand',
    'detailsModal',
    'detailsTitle',
    'detailsMeta',
    'detailsList',
    'detailsCloseButton',
    'detailsDeleteButton',
    'detailsEditButton',
    'conflictModal',
    'conflictBody',
    'conflictCloseButton',
    'conflictOkButton',
    'confirmModal',
    'confirmMessage',
    'confirmCloseButton',
    'confirmNoButton',
    'confirmYesButton',
    'blockTimeButton',
    'adminRequestsButton',
    'adminRequestsModal',
    'adminRequestsList',
    'adminRequestsCloseButton',
    'passwordResetRequestsButton',
    'passwordResetRequestsModal',
    'passwordResetRequestsList',
    'passwordResetRequestsCloseButton',
    'temporaryPasswordModal',
    'temporaryPasswordValue',
    'temporaryPasswordCloseButton',
    'temporaryPasswordDoneButton',
    'copyTemporaryPasswordButton',
    'activityLogButton',
    'activityLogModal',
    'activityList',
    'activityCloseButton',
    'reservationListButton',
    'reservationListModal',
    'reservationList',
    'reservationListCloseButton',
    'aboutButton',
    'aboutModal',
    'aboutCloseButton',
    'toastRegion'
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindStaticEvents() {
  els.todayButton.addEventListener('click', () => state.calendar?.today());
  els.prevButton.addEventListener('click', () => state.calendar?.prev());
  els.nextButton.addEventListener('click', () => state.calendar?.next());
  els.viewSelector.addEventListener('change', (event) => changeCalendarView(event.target.value));
  els.searchInput.addEventListener('input', debounce((event) => {
    state.searchTerm = event.target.value.trim().toLowerCase();
    refreshCalendar();
  }, 180));
  els.searchToggle.addEventListener('click', () => {
    els.searchWrap.classList.toggle('open');
    if (els.searchWrap.classList.contains('open')) els.searchInput.focus();
  });
  els.printButton.addEventListener('click', () => window.print());
  els.loginForm.addEventListener('submit', loginUser);
  els.registerForm.addEventListener('submit', registerUser);
  els.forgotPasswordButton.addEventListener('click', () => els.forgotPasswordModal.showModal());
  els.forgotPasswordCloseButton.addEventListener('click', () => els.forgotPasswordModal.close());
  els.forgotPasswordForm.addEventListener('submit', submitForgotPasswordRequest);
  els.changePasswordForm.addEventListener('submit', changeTemporaryPassword);
  els.changePasswordModal.addEventListener('cancel', (event) => event.preventDefault());
  els.logoutButton.addEventListener('click', logoutUser);
  els.createReservationButton.addEventListener('click', () => openReservationModal(defaultCreateRange()));
  els.blockTimeButton.addEventListener('click', () => openReservationModal(defaultCreateRange(), { type: 'blocked' }));
  els.reservationCloseButton.addEventListener('click', closeReservationModal);
  els.reservationForm.addEventListener('submit', saveReservationFromForm);
  els.deleteReservationButton.addEventListener('click', requestDeleteReservation);
  [els.agreeRules, els.agreePrivacy, els.agreeCommand].forEach((checkbox) => {
    checkbox.addEventListener('change', updateAgreementSubmitState);
  });
  els.agreementCloseButton.addEventListener('click', closeAgreementModal);
  els.agreementCancelButton.addEventListener('click', closeAgreementModal);
  els.agreementSubmitButton.addEventListener('click', submitAgreementReservation);
  els.detailsCloseButton.addEventListener('click', () => els.detailsModal.close());
  els.detailsDeleteButton.addEventListener('click', requestDeleteFromDetails);
  els.detailsEditButton.addEventListener('click', openEditFromDetails);
  els.conflictCloseButton.addEventListener('click', () => els.conflictModal.close());
  els.conflictOkButton.addEventListener('click', () => els.conflictModal.close());
  els.confirmCloseButton.addEventListener('click', closeConfirmModal);
  els.confirmNoButton.addEventListener('click', closeConfirmModal);
  els.confirmYesButton.addEventListener('click', deleteReservation);
  els.mobileMenuButton.addEventListener('click', openMobileSidebar);
  els.mobileScrim.addEventListener('click', closeMobileSidebar);
  els.miniPrevButton.addEventListener('click', () => shiftMiniCalendar(-1));
  els.miniNextButton.addEventListener('click', () => shiftMiniCalendar(1));
  els.myReservationsFilter.addEventListener('change', (event) => {
    state.filters.mine = event.target.checked;
    refreshCalendar();
  });
  document.querySelectorAll('.status-filter').forEach((checkbox) => {
    checkbox.addEventListener('change', updateStatusFilters);
  });
  els.adminRequestsButton.addEventListener('click', openAdminRequests);
  els.adminRequestsCloseButton.addEventListener('click', () => els.adminRequestsModal.close());
  els.adminRequestsList.addEventListener('click', handleAdminRequestAction);
  els.passwordResetRequestsButton.addEventListener('click', openPasswordResetRequests);
  els.passwordResetRequestsCloseButton.addEventListener('click', () => els.passwordResetRequestsModal.close());
  els.passwordResetRequestsList.addEventListener('click', handlePasswordResetRequestAction);
  els.temporaryPasswordCloseButton.addEventListener('click', closeTemporaryPasswordModal);
  els.temporaryPasswordDoneButton.addEventListener('click', closeTemporaryPasswordModal);
  els.copyTemporaryPasswordButton.addEventListener('click', () => copyText(els.temporaryPasswordValue.textContent));
  els.activityLogButton.addEventListener('click', openActivityLog);
  els.activityCloseButton.addEventListener('click', () => els.activityLogModal.close());
  els.reservationListButton.addEventListener('click', openReservationList);
  els.reservationListCloseButton.addEventListener('click', () => els.reservationListModal.close());
  els.reservationList.addEventListener('click', handleReservationListAction);
  els.aboutButton.addEventListener('click', () => els.aboutModal.showModal());
  els.aboutCloseButton.addEventListener('click', () => els.aboutModal.close());
  window.addEventListener('resize', debounce(handleResize, 160));
  window.addEventListener('orientationchange', () => setTimeout(handleResize, 260));
}

async function initializeSession() {
  if (!supabaseClient) {
    state.currentUser = null;
    state.profile = null;
    return;
  }

  const { data } = await supabaseClient.auth.getSession();
  state.currentUser = data.session?.user ?? null;
  if (state.currentUser) {
    state.profile = await fetchProfile(state.currentUser.id);
  }

  supabaseClient.auth.onAuthStateChange((_event, session) => deferAuthRefresh(session));
}

function deferAuthRefresh(session) {
  setTimeout(() => refreshAuthState(session), 0);
}

async function refreshAuthState(session) {
  state.currentUser = session?.user ?? null;
  state.profile = state.currentUser ? await fetchProfile(state.currentUser.id) : null;
  await renderAuthState();
}

async function renderAuthState() {
  const isSignedIn = Boolean(state.profile);
  const mustChangePassword = isSignedIn && requiresPasswordChange();
  els.authScreen.hidden = isSignedIn;
  els.appShell.hidden = !isSignedIn || mustChangePassword;
  els.authSetupNotice.hidden = Boolean(supabaseClient);

  if (!isSignedIn) {
    document.body.classList.remove('is-admin');
    return;
  }

  if (mustChangePassword) {
    if (!els.changePasswordModal.open) {
      els.changePasswordModal.showModal();
    }
    return;
  }

  if (els.changePasswordModal.open) {
    els.changePasswordModal.close();
  }

  renderProfile();
  updateAdminVisibility();
  if (!state.calendar) {
    renderMiniCalendar();
    updateResponsiveViewOptions();
    initializeCalendar();
  }
  await loadSchedule();
  refreshCalendar();
  updateAvailability();
  setTimeout(() => state.calendar?.updateSize(), 0);
}

function initializeCalendar() {
  state.calendar = new FullCalendar.Calendar(els.calendar, {
    initialView: getResponsiveDefaultView(),
    firstDay: 1,
    height: '100%',
    expandRows: true,
    nowIndicator: true,
    selectable: true,
    selectMirror: true,
    selectMinDistance: 3,
    longPressDelay: 220,
    selectLongPressDelay: 220,
    eventLongPressDelay: 300,
    editable: true,
    eventResizableFromStart: true,
    slotMinTime: '07:00:00',
    slotMaxTime: '19:00:00',
    slotDuration: '00:30:00',
    snapDuration: '00:15:00',
    allDaySlot: false,
    businessHours: {
      daysOfWeek: [1, 2, 3, 4, 5],
      startTime: SCHOOL_HOURS.start,
      endTime: SCHOOL_HOURS.end
    },
    headerToolbar: false,
    views: {
      multiMonthYear: {
        type: 'multiMonth',
        duration: { months: 12 },
        multiMonthMaxColumns: 3
      },
      listWeek: {
        buttonText: 'Agenda'
      }
    },
    events: (_info, successCallback) => successCallback(getVisibleEvents()),
    datesSet: (info) => {
      els.calendarTitle.textContent = info.view.title;
      els.viewSelector.value = info.view.type;
      state.miniCalendarDate = new Date(info.start);
      renderMiniCalendar();
      updateAvailability();
    },
    select: (selectionInfo) => {
      if (!requireReservationAccount()) {
        state.calendar.unselect();
        return;
      }
      openReservationModal({
        start: selectionInfo.start,
        end: selectionInfo.end
      });
      state.calendar.unselect();
    },
    dateClick: (info) => {
      if (window.innerWidth > MOBILE_BREAKPOINT || info.allDay) return;
      if (!requireReservationAccount()) return;
      const start = roundToNextHalfHour(info.date);
      const end = addMinutes(start, 60);
      openReservationModal({ start, end });
    },
    eventClick: (info) => openDetailsModal(info.event),
    eventAllow: (dropInfo, draggedEvent) => canMoveEvent(draggedEvent, dropInfo.start, dropInfo.end),
    eventDrop: (info) => persistMovedEvent(info),
    eventResize: (info) => persistMovedEvent(info)
  });

  state.calendar.render();
  els.viewSelector.value = state.calendar.view.type;
  updateResponsiveViewOptions();
}

async function loadSchedule() {
  if (!supabaseClient) {
    resetScheduleState();
    return;
  }

  try {
    const shouldLoadLogs = isAdmin();
    const reservationsQuery = isAdmin()
      ? supabaseClient.from('reservations').select('*').order('start_time', { ascending: true })
      : loadStudentCalendarReservations();
    const [reservations, blockedTimes, activityLogs, adminRequests, passwordResetRequests] =
      await runSupabaseQueries([
        reservationsQuery,
        supabaseClient.from('blocked_times').select('*').order('start_time', { ascending: true }),
        shouldLoadLogs
          ? supabaseClient.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(100)
          : null,
        shouldLoadLogs
          ? supabaseClient.from('admin_requests').select('*').order('requested_at', { ascending: true })
          : null,
        shouldLoadLogs
          ? supabaseClient.from('password_reset_requests').select('*').order('requested_at', { ascending: true })
          : null
      ]);

    Object.assign(state, {
      reservations,
      blockedTimes,
      activityLogs,
      adminRequests,
      passwordResetRequests
    });
  } catch (error) {
    showToast(`Could not load Supabase data: ${error.message}`, 'error');
  }
}

async function loadStudentCalendarReservations() {
  const result = await supabaseClient.rpc('get_calendar_reservations');
  if (!result.error) return result;
  if (isMissingSupabaseObjectError(result.error, 'get_calendar_reservations')) {
    const fallback = await supabaseClient.from('reservations').select('*').order('start_time', { ascending: true });
    if (fallback.error) return fallback;
    return {
      data: fallback.data.map(maskReservationForStudentFallback),
      error: null
    };
  }
  return result;
}

function isMissingSupabaseObjectError(error, objectName) {
  const message = String(error?.message || '');
  return ['42883', '42P01', 'PGRST202', 'PGRST205'].includes(error?.code)
    || message.includes(objectName)
    || message.includes('Could not find')
    || message.includes('schema cache');
}

function maskReservationForStudentFallback(reservation) {
  if (reservation.created_by === state.profile?.id) return reservation;
  return {
    ...reservation,
    title: 'Reserved',
    organization: null,
    people_involved: null,
    purpose: null,
    notes: null,
    account_email: null,
    created_by: null,
    reserved_by_name: null
  };
}

async function runSupabaseQueries(queries) {
  const results = await Promise.all(
    queries.map((query) => query ?? Promise.resolve({ data: [], error: null }))
  );
  const failed = results.find(({ error }) => error);
  if (failed) throw failed.error;
  return results.map(({ data }) => data ?? []);
}

function resetScheduleState() {
  SCHEDULE_STATE_KEYS.forEach((key) => {
    state[key] = [];
  });
}

function getVisibleEvents() {
  const searchTerm = state.searchTerm;
  const currentUserId = state.profile?.id;

  const reservationEvents = state.reservations
    .filter((reservation) => state.filters.statuses.has(reservation.status))
    .filter((reservation) => !state.filters.mine || reservation.created_by === currentUserId)
    .filter((reservation) => matchesSearch(reservation, searchTerm))
    .map((reservation) => ({
      id: reservation.id,
      title: getReservationDisplayTitle(reservation),
      start: reservation.start_time,
      end: reservation.end_time,
      classNames: [`event-${reservation.status}`],
      editable: canEditRecord(reservation),
      extendedProps: {
        type: 'reservation',
        record: reservation,
        status: reservation.status
      }
    }));

  const blockedEvents = state.blockedTimes
    .filter(() => state.filters.statuses.has('blocked'))
    .filter((blocked) => !state.filters.mine || blocked.created_by === currentUserId)
    .filter((blocked) => matchesSearch(blocked, searchTerm))
    .map((blocked) => ({
      id: blocked.id,
      title: isAdmin() ? (blocked.title || 'Blocked time') : 'Reserved - CSC Conference Room',
      start: blocked.start_time,
      end: blocked.end_time,
      classNames: ['event-blocked'],
      editable: isAdmin(),
      extendedProps: {
        type: 'blocked',
        record: blocked,
        status: 'blocked'
      }
    }));

  return [...reservationEvents, ...blockedEvents];
}

function refreshCalendar() {
  if (!state.calendar) return;
  state.calendar.refetchEvents();
  updateAvailability();
}

function changeCalendarView(viewName) {
  const nextView = getAllowedView(viewName);
  state.calendar.changeView(nextView);
  els.viewSelector.value = nextView;
  setTimeout(() => state.calendar.updateSize(), 0);
}

function handleResize() {
  if (!state.calendar) return;
  updateResponsiveViewOptions();
  const preferredView = getResponsiveDefaultView();
  if (state.calendar.view.type !== getAllowedView(state.calendar.view.type)) {
    state.calendar.changeView(preferredView);
    els.viewSelector.value = preferredView;
  }
  state.calendar.updateSize();
}

function openReservationModal(range, options = {}) {
  const profileName = state.profile?.full_name || state.currentUser?.email || 'Guest';
  const type = options.type || 'reservation';
  const record = options.record;

  els.reservationForm.reset();
  els.reservationId.value = record?.id || '';
  els.reservationModalTitle.textContent = record ? 'Edit Reservation' : type === 'blocked' ? 'Block Time' : ROOM_NAME;
  els.reservationType.value = type;
  els.reservationDate.value = formatDateInput(range.start);
  els.reservationStart.value = formatTimeInput(range.start);
  els.reservationEnd.value = formatTimeInput(range.end);
  els.reservationStatus.value = record?.status || 'confirmed';
  els.reservationOrganization.value = record?.organization || '';
  els.reservationPeople.value = record?.people_involved || '';
  els.reservationPurpose.value = record?.purpose || record?.reason || '';
  els.reservationReservedBy.value = record?.reserved_by_name || profileName;

  const canEdit = type === 'blocked' ? isAdmin() : !record || canEditRecord(record);
  [...els.reservationForm.elements].forEach((element) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName) && element.type !== 'hidden' && element.id !== 'reservationReservedBy') {
      element.disabled = !canEdit || (element.id === 'reservationStatus' && !isAdmin());
    }
  });
  els.deleteReservationButton.hidden = !record || !canDeleteRecord(record, type);
  els.saveReservationButton.hidden = !canEdit;

  els.reservationModal.showModal();
}

function closeReservationModal() {
  state.calendar?.unselect();
  els.reservationForm.reset();
  els.reservationModal.close();
}

async function saveReservationFromForm(event) {
  event.preventDefault();
  if (!requireReservationAccount()) return;

  const formData = getReservationFormData();
  const validation = validateReservation(formData);
  if (!validation.ok) {
    showToast(validation.message, 'error');
    return;
  }

  const conflict = findConflict(formData.start, formData.end, formData.id);
  if (conflict) {
    showConflict(conflict);
    return;
  }

  if (formData.type === 'reservation' && !isAdmin()) {
    openAgreementModal(formData);
    return;
  }

  await persistReservationFormData(formData);
}

async function persistReservationFormData(formData) {
  try {
    if (formData.type === 'blocked') {
      if (!isAdmin()) throw new Error('Only admins can block unavailable time.');
      await saveBlockedTime(formData);
    } else {
      await saveReservation(formData);
    }

    els.reservationModal.close();
    await loadSchedule();
    refreshCalendar();
    showToast('Schedule saved and confirmed.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function openAgreementModal(formData) {
  state.pendingAgreementFormData = formData;
  els.agreeRules.checked = false;
  els.agreePrivacy.checked = false;
  els.agreeCommand.checked = false;
  updateAgreementSubmitState();
  els.agreementModal.showModal();
}

function closeAgreementModal() {
  state.pendingAgreementFormData = null;
  els.agreementModal.close();
}

function updateAgreementSubmitState() {
  els.agreementSubmitButton.disabled = !(els.agreeRules.checked && els.agreePrivacy.checked && els.agreeCommand.checked);
}

async function submitAgreementReservation() {
  if (els.agreementSubmitButton.disabled || !state.pendingAgreementFormData) return;
  const formData = {
    ...state.pendingAgreementFormData,
    agreements: {
      accepted_rules: true,
      accepted_data_privacy: true,
      accepted_chain_of_command: true
    }
  };
  state.pendingAgreementFormData = null;
  els.agreementModal.close();
  await persistReservationFormData(formData);
}

async function saveReservation(formData) {
  const payload = {
    title: ROOM_NAME,
    start_time: formData.start.toISOString(),
    end_time: formData.end.toISOString(),
    organization: formData.organization,
    people_involved: formData.people,
    purpose: formData.purpose,
    status: formData.status,
    reserved_by_name: formData.reservedBy,
    account_email: state.currentUser?.email || '',
    accepted_rules: isAdmin() || Boolean(formData.agreements?.accepted_rules),
    accepted_data_privacy: isAdmin() || Boolean(formData.agreements?.accepted_data_privacy),
    accepted_chain_of_command: isAdmin() || Boolean(formData.agreements?.accepted_chain_of_command),
    created_by: formData.existing?.created_by || state.profile.id
  };

  const query = supabaseClient.from('reservations');
  let savedReservationId = formData.id;
  let result = formData.id
    ? await query.update(payload).eq('id', formData.id)
    : await query.insert(payload).select('id').single();
  if (result.error && ['account_email', 'accepted_rules', 'accepted_data_privacy', 'accepted_chain_of_command']
    .some((column) => String(result.error.message || '').includes(column))) {
    delete payload.account_email;
    delete payload.accepted_rules;
    delete payload.accepted_data_privacy;
    delete payload.accepted_chain_of_command;
    result = formData.id
      ? await query.update(payload).eq('id', formData.id)
      : await query.insert(payload).select('id').single();
  }
  if (!formData.id) savedReservationId = result.data?.id || null;
  const { error } = result;
  if (error) throw error;
  if (formData.agreements && savedReservationId) {
    await saveReservationAgreements(savedReservationId, formData.agreements);
  }
}

async function saveReservationAgreements(reservationId, agreements) {
  const payload = {
    user_id: state.profile.id,
    reservation_id: reservationId,
    accepted_rules: agreements.accepted_rules,
    accepted_data_privacy: agreements.accepted_data_privacy,
    accepted_chain_of_command: agreements.accepted_chain_of_command,
    accepted_at: new Date().toISOString()
  };
  const { error } = await supabaseClient.from('reservation_agreements').insert(payload);
  if (error && !isMissingSupabaseObjectError(error, 'reservation_agreements')) throw error;
}

async function saveBlockedTime(formData) {
  const payload = {
    title: formData.title || 'Blocked time',
    start_time: formData.start.toISOString(),
    end_time: formData.end.toISOString(),
    reason: formData.purpose,
    created_by: state.profile.id
  };

  const query = supabaseClient.from('blocked_times');
  const { error } = formData.id
    ? await query.update(payload).eq('id', formData.id)
    : await query.insert(payload);
  if (error) throw error;
}

function getReservationFormData() {
  const id = els.reservationId.value;
  const type = els.reservationType.value;
  const existing = type === 'blocked'
    ? state.blockedTimes.find((item) => item.id === id)
    : state.reservations.find((item) => item.id === id);
  const start = combineDateAndTime(els.reservationDate.value, els.reservationStart.value);
  const end = combineDateAndTime(els.reservationDate.value, els.reservationEnd.value);

  return {
    id,
    type,
    existing,
    title: ROOM_NAME,
    start,
    end,
    status: els.reservationStatus.value,
    organization: els.reservationOrganization.value.trim(),
    people: els.reservationPeople.value.trim(),
    purpose: els.reservationPurpose.value.trim(),
    reservedBy: els.reservationReservedBy.value.trim() || state.profile?.full_name || state.currentUser?.email || 'Unknown'
  };
}

function validateReservation(formData) {
  if (!formData.reservedBy || !formData.organization || !formData.people || !formData.purpose) {
    return { ok: false, message: 'Please complete all required fields before submitting your reservation.' };
  }
  if (!formData.start || !formData.end || Number.isNaN(formData.start.getTime()) || Number.isNaN(formData.end.getTime())) {
    return { ok: false, message: 'Please complete all required fields before submitting your reservation.' };
  }
  if (formData.start >= formData.end) return { ok: false, message: 'End time must be later than start time.' };
  if (formData.start < new Date()) return { ok: false, message: 'Reservations cannot be created in the past.' };
  if (!isWeekday(formData.start)) return { ok: false, message: 'Reservations are limited to Monday through Friday.' };
  if (!isWithinSchoolHours(formData.start, formData.end)) {
    return { ok: false, message: 'Reservations must be between 8:00 AM and 5:00 PM.' };
  }
  if (formData.type === 'reservation' && !isAdmin()) {
    const durationHours = (formData.end - formData.start) / 36e5;
    if (durationHours > MAX_STUDENT_BOOKING_HOURS) {
      return { ok: false, message: 'Student reservations are limited to a maximum of 5 hours.' };
    }
    if (!formData.id && countStudentReservationsThisWeek(formData.start) >= MAX_STUDENT_BOOKINGS_PER_WEEK) {
      return { ok: false, message: 'You have reached the maximum limit of 2 reservations this week.' };
    }
  }
  const advanceHours = (formData.start - new Date()) / 36e5;
  if (!formData.id && advanceHours < MIN_ADVANCE_HOURS) {
    return { ok: false, message: 'Reservations must be made at least 1 day in advance.' };
  }
  if (formData.type === 'blocked' && !isAdmin()) return { ok: false, message: 'Only admins can block time.' };
  return { ok: true };
}

function findConflict(start, end, excludeId) {
  const activeReservations = state.reservations
    .filter((reservation) => reservation.id !== excludeId)
    .filter((reservation) => reservation.status === 'confirmed')
    .map((reservation) => ({
      title: reservation.title,
      start: new Date(reservation.start_time),
      end: new Date(reservation.end_time),
      reservedBy: reservation.reserved_by_name || 'Unknown'
    }));

  const blockedRanges = state.blockedTimes
    .filter((blocked) => blocked.id !== excludeId)
    .map((blocked) => ({
      title: blocked.title || 'Blocked time',
      start: new Date(blocked.start_time),
      end: new Date(blocked.end_time),
      reservedBy: 'AUP Admin'
    }));

  return [...activeReservations, ...blockedRanges].find((item) => start < item.end && end > item.start);
}

function showConflict(conflict) {
  els.conflictBody.innerHTML = `
    <strong>This time slot is already reserved. Please choose another schedule.</strong>
    <p>${formatDateTime(conflict.start)} - ${formatTime(conflict.end)}</p>
    <p>${escapeHtml(isAdmin() ? conflict.title : ROOM_NAME)}</p>
  `;
  els.conflictModal.showModal();
}

function openDetailsModal(event) {
  const { record, type } = event.extendedProps;
  const isBlocked = type === 'blocked';
  const canEdit = isBlocked ? isAdmin() : canEditRecord(record);
  const canViewPrivate = isBlocked ? isAdmin() : canViewPrivateRecord(record);
  const start = new Date(event.start);
  const end = new Date(event.end);

  els.detailsTitle.textContent = canViewPrivate ? getReservationDisplayTitle(record) : 'Reserved';
  els.detailsMeta.textContent = `${formatDateTime(start)} - ${formatTime(end)}`;
  els.detailsList.innerHTML = canViewPrivate
    ? detailsRows({
      Status: isBlocked ? 'Blocked' : capitalize(record.status),
      Room: ROOM_NAME,
      Organization: record.organization || 'Not provided',
      'Number of People Involved': record.people_involved || 'Not provided',
      'Purpose of Meeting': record.purpose || record.reason || 'Not provided',
      'Student Name': record.reserved_by_name || 'CSC Officer/Admin'
    })
    : detailsRows({
      Status: 'Reserved',
      Room: ROOM_NAME,
      Date: start.toLocaleDateString(),
      'Start Time': formatTime(start),
      'End Time': formatTime(end)
    });
  els.detailsEditButton.hidden = !canEdit;
  els.detailsEditButton.dataset.eventId = event.id;
  els.detailsEditButton.dataset.eventType = type;
  els.detailsDeleteButton.hidden = !canDeleteRecord(record, type);
  els.detailsDeleteButton.dataset.eventId = event.id;
  els.detailsDeleteButton.dataset.eventType = type;
  els.detailsModal.showModal();
}

function openEditFromDetails() {
  const id = els.detailsEditButton.dataset.eventId;
  const type = els.detailsEditButton.dataset.eventType;
  const record = type === 'blocked'
    ? state.blockedTimes.find((item) => item.id === id)
    : state.reservations.find((item) => item.id === id);

  if (!record) return;
  els.detailsModal.close();
  openReservationModal(
    { start: new Date(record.start_time), end: new Date(record.end_time) },
    { record, type }
  );
}

function requestDeleteFromDetails() {
  const id = els.detailsDeleteButton.dataset.eventId;
  const type = els.detailsDeleteButton.dataset.eventType || 'reservation';
  if (!id) return;
  const record = type === 'blocked'
    ? state.blockedTimes.find((item) => item.id === id)
    : state.reservations.find((item) => item.id === id);

  if (!canDeleteRecord(record, type)) {
    showToast('Unauthorized action. You may only delete your own reservations.', 'error');
    return;
  }

  state.pendingDeleteId = id;
  els.confirmMessage.textContent = type === 'blocked'
    ? 'Delete this blocked time from the CSC Conference Room schedule?'
    : 'Delete this reservation from the CSC Conference Room schedule?';
  els.confirmModal.showModal();
}

function requestDeleteReservation() {
  const id = els.reservationId.value;
  if (!id) return;
  const type = els.reservationType.value || 'reservation';
  const record = type === 'blocked'
    ? state.blockedTimes.find((item) => item.id === id)
    : state.reservations.find((item) => item.id === id);

  if (!canDeleteRecord(record, type)) {
    showToast('Unauthorized action. You may only delete your own reservations.', 'error');
    return;
  }

  state.pendingDeleteId = id;
  els.confirmMessage.textContent = type === 'blocked'
    ? 'Delete this blocked time from the CSC Conference Room schedule?'
    : 'Delete this reservation from the CSC Conference Room schedule?';
  els.confirmModal.showModal();
}

function closeConfirmModal() {
  state.pendingDeleteId = null;
  els.confirmModal.close();
}

async function deleteReservation() {
  const id = state.pendingDeleteId;
  if (!id) return;
  const reservation = state.reservations.find((item) => item.id === id);
  const blocked = state.blockedTimes.find((item) => item.id === id);

  try {
    if (blocked) {
      if (!isAdmin()) throw new Error('Only admins can remove blocked time.');
      const { error } = await supabaseClient.from('blocked_times').delete().eq('id', id);
      if (error) throw error;
    } else if (reservation) {
      if (!canDeleteRecord(reservation, 'reservation')) {
        throw new Error('Unauthorized action. You may only delete your own reservations.');
      }
      const { error } = await supabaseClient.from('reservations').delete().eq('id', id);
      if (error) throw error;
    }

    state.pendingDeleteId = null;
    els.confirmModal.close();
    if (els.reservationModal.open) els.reservationModal.close();
    if (els.detailsModal.open) els.detailsModal.close();
    await loadSchedule();
    refreshCalendar();
    showToast('Schedule slot deleted.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function canMoveEvent(event, start, end) {
  const { record, type } = event.extendedProps;
  if (type === 'blocked' && !isAdmin()) return false;
  if (type === 'reservation' && !canEditRecord(record)) return false;
  const validation = validateReservation({
    id: event.id,
    type,
    title: ROOM_NAME,
    purpose: record.purpose || record.reason || 'Blocked',
    organization: record.organization || 'CSC',
    people: record.people_involved || '1',
    reservedBy: record.reserved_by_name || state.profile?.full_name || 'CSC Officer/Admin',
    start,
    end
  });
  if (!validation.ok) return false;
  return !findConflict(start, end, event.id);
}

async function persistMovedEvent(info) {
  const { record, type } = info.event.extendedProps;
  const formData = {
    id: info.event.id,
    type,
    title: record.title || info.event.title,
    purpose: record.purpose || record.reason || 'Blocked time',
    start: info.event.start,
    end: info.event.end,
    organization: record.organization || '',
    people: record.people_involved || '',
    status: record.status || 'confirmed',
    reservedBy: record.reserved_by_name || state.profile?.full_name || 'CSC Officer/Admin',
    existing: record
  };

  try {
    if (type === 'blocked') {
      await saveBlockedTime(formData);
    } else {
      await saveReservation(formData);
    }
    await loadSchedule();
    refreshCalendar();
    showToast('Reservation time updated.', 'success');
  } catch (error) {
    info.revert();
    showToast(error.message, 'error');
  }
}

async function loginUser(event) {
  event.preventDefault();
  if (!supabaseClient) {
    showToast('Supabase is not configured. Check supabaseClient.js.', 'error');
    return;
  }

  const studentNumber = normalizeStudentNumber(els.loginStudentNumber.value);
  const password = els.loginPassword.value;
  if (!studentNumber) {
    showToast('Enter a valid student number.', 'error');
    return;
  }

  const email = studentNumberToAuthEmail(studentNumber);
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    showToast('Login failed. Check the student number and password.', 'error');
    return;
  }
  showToast('Logged in.', 'success');
}

async function submitForgotPasswordRequest(event) {
  event.preventDefault();
  if (!supabaseClient) {
    showToast('Supabase is not configured. Check supabaseClient.js.', 'error');
    return;
  }

  const studentNumber = normalizeStudentNumber(els.forgotStudentNumber.value);
  const fullName = els.forgotFullName.value.trim();
  const department = els.forgotDepartment.value.trim();
  const message = els.forgotMessage.value.trim();

  if (!studentNumber || !fullName) {
    showToast('Student number and full name are required.', 'error');
    return;
  }

  const { error } = await supabaseClient.from('password_reset_requests').insert({
    student_number: studentNumber,
    full_name: fullName,
    department,
    message
  });

  if (error) {
    if (error.code === '23505') {
      showToast('A pending password reset request already exists for this student number.', 'error');
      return;
    }
    showToast(error.message, 'error');
    return;
  }

  els.forgotPasswordForm.reset();
  els.forgotPasswordModal.close();
  showToast('Password reset request submitted. Please wait for admin verification.', 'success');
}

async function registerUser(event) {
  event.preventDefault();
  if (!supabaseClient) {
    showToast('Supabase is not configured. Check supabaseClient.js.', 'error');
    return;
  }

  const studentNumber = normalizeStudentNumber(els.registerStudentNumber.value);
  const password = els.registerPassword.value;
  const fullName = els.registerFullName.value.trim();
  const department = els.registerDepartment.value.trim();
  const requestedRole = els.registerAccountType.value;

  if (!studentNumber || !fullName) {
    showToast('Student number and full name are required.', 'error');
    return;
  }

  const email = studentNumberToAuthEmail(studentNumber);
  const { error } = await supabaseClient.rpc('create_student_account', {
    p_student_number: studentNumber,
    p_password: password,
    p_full_name: fullName,
    p_department: department,
    p_requested_role: requestedRole
  });

  if (error) {
    showToast(getSignupErrorMessage(error), 'error');
    return;
  }

  const { error: loginError } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (loginError) {
    showToast('Account created, but automatic login failed. Try logging in manually.', 'error');
    return;
  }

  els.registerForm.reset();
  showToast(
    requestedRole === 'admin'
      ? 'Account created as student. Admin access is pending approval.'
      : 'Student account created. You can log in with your student number.',
    'success'
  );
}

async function changeTemporaryPassword(event) {
  event.preventDefault();
  const password = els.newPassword.value;
  const confirmPassword = els.confirmNewPassword.value;

  setChangePasswordMessage('');
  if (password.length < 6) {
    setChangePasswordMessage('Password must be at least 6 characters.', 'error');
    return;
  }

  if (password !== confirmPassword) {
    setChangePasswordMessage('Passwords do not match.', 'error');
    return;
  }

  setChangePasswordBusy(true);

  try {
    const { data, error } = await withTimeout(
      supabaseClient.auth.updateUser({
        password,
        data: { must_change_password: false }
      }),
      PASSWORD_UPDATE_TIMEOUT_MS,
      'Password update took too long. Please check your connection and try again.'
    );

    if (error) {
      setChangePasswordMessage(error.message, 'error');
      return;
    }

    state.currentUser = data.user;
    els.changePasswordForm.reset();
    setChangePasswordMessage('');
    showToast('Password updated.', 'success');
    await renderAuthState();
  } catch (error) {
    setChangePasswordMessage(error.message || 'Password update failed. Please try again.', 'error');
  } finally {
    setChangePasswordBusy(false);
  }
}

function setChangePasswordBusy(isBusy) {
  els.changePasswordButton.disabled = isBusy;
  els.changePasswordButton.textContent = isBusy ? 'Updating...' : 'Update password';
}

function setChangePasswordMessage(message, type = '') {
  els.changePasswordMessage.textContent = message;
  els.changePasswordMessage.className = type ? `form-message ${type}` : 'form-message';
}

function updateStatusFilters() {
  state.filters.statuses = new Set(
    [...document.querySelectorAll('.status-filter:checked')].map((input) => input.value)
  );
  refreshCalendar();
}

async function logoutUser() {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }
  state.currentUser = null;
  state.profile = null;
  resetScheduleState();
  await renderAuthState();
}

async function fetchProfile(userId) {
  const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
  if (error || !data) {
    const { data: userData } = await supabaseClient.auth.getUser();
    const user = userData?.user;
    return {
      id: userId,
      email: user?.email || '',
      student_number: user?.user_metadata?.student_number || '',
      full_name: user?.user_metadata?.full_name || user?.email || 'Student',
      department: user?.user_metadata?.department || '',
      role: 'student'
    };
  }
  return data;
}

function requireReservationAccount() {
  if (state.profile) return true;
  showToast('Please login before reserving the CSC Conference Room.', 'error');
  return false;
}

function renderProfile() {
  const name = state.profile?.full_name || state.currentUser?.email || 'Guest';
  els.profileName.textContent = name;
  els.profileInitials.textContent = initials(name);
}

function updateAdminVisibility() {
  document.body.classList.toggle('is-admin', isAdmin());
}

function isAdmin() {
  return state.profile?.role === 'admin';
}

function requiresPasswordChange() {
  return state.currentUser?.user_metadata?.must_change_password === true;
}

function canEditRecord(record) {
  return isAdmin() || record.created_by === state.profile?.id;
}

function canDeleteRecord(record, type = 'reservation') {
  if (type === 'blocked') return isAdmin();
  return isAdmin() || record?.created_by === state.profile?.id;
}

function canViewPrivateRecord(record) {
  return isAdmin() || record.created_by === state.profile?.id;
}

function getReservationDisplayTitle(record) {
  if (!record || !canViewPrivateRecord(record)) return `Reserved - ${ROOM_NAME}`;
  return record.title || ROOM_NAME;
}

function countStudentReservationsThisWeek(date) {
  const { start, end } = getWeekRange(date);
  return state.reservations.filter((reservation) => {
    if (reservation.id && reservation.status !== 'confirmed') return false;
    if (reservation.created_by !== state.profile?.id) return false;
    const reservationStart = new Date(reservation.start_time);
    return reservationStart >= start && reservationStart < end;
  }).length;
}

function getWeekRange(date) {
  const start = new Date(date);
  const dayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dayOffset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

function updateAvailability() {
  const now = new Date();
  const active = [
    ...state.reservations.filter((item) => item.status === 'confirmed'),
    ...state.blockedTimes
  ].find((item) => {
    const start = new Date(item.start_time);
    const end = new Date(item.end_time);
    return now >= start && now < end;
  });

  const card = els.availabilityStatus.closest('.availability-card');
  if (active) {
    card.classList.add('busy');
    els.availabilityStatus.textContent = `In Use Until ${formatTime(new Date(active.end_time))}`;
    els.availabilityDetail.textContent = isAdmin() ? (active.title || active.reason || 'Conference room unavailable') : `${ROOM_NAME} is reserved.`;
  } else {
    card.classList.remove('busy');
    els.availabilityStatus.textContent = 'Available Now';
    els.availabilityDetail.textContent = 'No active reservation or blocked time at this moment.';
  }
}

function renderMiniCalendar() {
  const date = state.miniCalendarDate;
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const startDate = new Date(year, month, 1 - startOffset);
  const todayKey = formatDateInput(new Date());
  const selectedKey = state.calendar ? formatDateInput(state.calendar.getDate()) : todayKey;
  const weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  els.miniCalendarTitle.textContent = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  els.miniCalendar.innerHTML = '';
  weekdays.forEach((weekday) => {
    const cell = document.createElement('div');
    cell.className = 'mini-weekday';
    cell.textContent = weekday;
    els.miniCalendar.appendChild(cell);
  });

  for (let i = 0; i < 42; i += 1) {
    const day = new Date(startDate);
    day.setDate(startDate.getDate() + i);
    const key = formatDateInput(day);
    const button = document.createElement('button');
    button.className = 'mini-day';
    button.textContent = day.getDate();
    button.type = 'button';
    button.style.opacity = day.getMonth() === month ? '1' : '0.35';
    button.classList.toggle('today', key === todayKey);
    button.classList.toggle('selected', key === selectedKey);
    button.addEventListener('click', () => {
      state.calendar.gotoDate(day);
      closeMobileSidebar();
    });
    els.miniCalendar.appendChild(button);
  }
}

function shiftMiniCalendar(months) {
  state.miniCalendarDate = new Date(
    state.miniCalendarDate.getFullYear(),
    state.miniCalendarDate.getMonth() + months,
    1
  );
  renderMiniCalendar();
}

function openAdminRequests() {
  if (!isAdmin()) {
    showToast('Only admins can review admin account requests.', 'error');
    return;
  }

  renderAdminRequests();
  els.adminRequestsModal.showModal();
}

function renderAdminRequests() {
  renderRequestList({
    container: els.adminRequestsList,
    requests: state.adminRequests,
    emptyHtml: EMPTY_ADMIN_REQUESTS,
    extraRows: [],
    idAttribute: 'request-id',
    actionAttribute: 'request-action',
    approveLabel: 'Approve admin'
  });
}

async function handleAdminRequestAction(event) {
  const button = event.target.closest('[data-request-action]');
  if (!button) return;

  const id = button.dataset.requestId;
  const status = button.dataset.requestAction;
  const request = state.adminRequests.find((item) => item.id === id);
  if (!request || !isAdmin()) return;

  const { error } = await supabaseClient
    .from('admin_requests')
    .update({
      status,
      reviewed_by: state.profile.id,
      reviewed_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) {
    showToast(error.message, 'error');
    return;
  }

  await loadSchedule();
  renderAdminRequests();
  showToast(status === 'approved' ? 'Admin access approved.' : 'Admin request denied.', 'success');
}

function openPasswordResetRequests() {
  if (!isAdmin()) {
    showToast('Only admins can review password reset requests.', 'error');
    return;
  }

  renderPasswordResetRequests();
  els.passwordResetRequestsModal.showModal();
}

function renderPasswordResetRequests() {
  renderRequestList({
    container: els.passwordResetRequestsList,
    requests: state.passwordResetRequests,
    emptyHtml: EMPTY_PASSWORD_RESETS,
    extraRows: [(request) => `Message: ${escapeHtml(request.message || 'None')}`],
    idAttribute: 'reset-id',
    actionAttribute: 'reset-action',
    approveLabel: 'Approve reset'
  });
}

function renderRequestList({
  container,
  requests,
  emptyHtml,
  extraRows,
  idAttribute,
  actionAttribute,
  approveLabel
}) {
  const pending = requests.filter((request) => request.status === 'pending');
  container.innerHTML = '';

  if (!pending.length) {
    container.innerHTML = emptyHtml;
    return;
  }

  pending.forEach((request) => {
    const rows = [
      `Student number: ${escapeHtml(request.student_number)}`,
      `Department: ${escapeHtml(request.department || 'Not provided')}`,
      ...extraRows.map((renderRow) => renderRow(request)),
      `Requested: ${formatDateTime(new Date(request.requested_at))}`
    ];

    const item = document.createElement('div');
    item.className = 'activity-item request-item';
    item.innerHTML = `
      <strong>${escapeHtml(request.full_name || 'Unnamed requester')}</strong>
      ${rows.map((row) => `<p>${row}</p>`).join('')}
      <div class="request-actions">
        <button type="button" class="secondary-button" data-${actionAttribute}="denied" data-${idAttribute}="${request.id}">Deny</button>
        <button type="button" class="primary-button" data-${actionAttribute}="approved" data-${idAttribute}="${request.id}">
          ${approveLabel}
        </button>
      </div>
    `;
    container.appendChild(item);
  });
}

function buildActivityDescription(log) {
  const payload = log.new_value || log.old_value || {};
  const studentName = log.student_name || payload.reserved_by_name || 'A student';
  const action = String(log.action || 'updated').replaceAll('_', ' ');
  const start = payload.start_time ? new Date(payload.start_time) : null;
  const end = payload.end_time ? new Date(payload.end_time) : null;
  const timeText = start && end
    ? ` on ${start.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}, from ${formatTime(start)} to ${formatTime(end)}`
    : '';
  return `${studentName} ${action} a reservation for the ${ROOM_NAME}${timeText}.`;
}

async function handlePasswordResetRequestAction(event) {
  const button = event.target.closest('[data-reset-action]');
  if (!button) return;

  const requestId = button.dataset.resetId;
  const decision = button.dataset.resetAction;
  const request = state.passwordResetRequests.find((item) => item.id === requestId);
  if (!request || !isAdmin()) return;

  const { data, error } = await supabaseClient.functions.invoke('review-password-reset', {
    body: { requestId, decision }
  });

  if (error) {
    showToast(error.message || 'Password reset review failed.', 'error');
    return;
  }

  await loadSchedule();
  renderPasswordResetRequests();

  if (decision === 'approved') {
    showTemporaryPassword(data?.temporaryPassword);
  } else {
    showToast('Password reset request denied.', 'success');
  }
}

function showTemporaryPassword(temporaryPassword) {
  if (!temporaryPassword) {
    showToast('Reset approved, but no temporary password was returned.', 'error');
    return;
  }
  els.temporaryPasswordValue.textContent = temporaryPassword;
  els.temporaryPasswordModal.showModal();
}

function closeTemporaryPasswordModal() {
  els.temporaryPasswordValue.textContent = '';
  els.temporaryPasswordModal.close();
}

function openReservationList() {
  if (!isAdmin()) {
    showToast('Only CSC Officers/Admins can view the full reservation list.', 'error');
    return;
  }
  renderReservationList();
  els.reservationListModal.showModal();
}

function renderReservationList() {
  els.reservationList.innerHTML = '';
  if (!state.reservations.length) {
    els.reservationList.innerHTML = '<div class="activity-item"><strong>No reservations found</strong><p>Reservations will appear here after students book the room.</p></div>';
    return;
  }

  [...state.reservations]
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
    .forEach((reservation) => {
      const start = new Date(reservation.start_time);
      const end = new Date(reservation.end_time);
      const item = document.createElement('div');
      item.className = 'activity-item request-item';
      item.innerHTML = `
        <strong>${escapeHtml(reservation.reserved_by_name || 'Unnamed student')}</strong>
        <p>${escapeHtml(reservation.organization || 'No organization')} - ${formatDateTime(start)} to ${formatTime(end)}</p>
        <p>${escapeHtml(reservation.purpose || 'No purpose recorded')}</p>
        <div class="request-actions">
          <button type="button" class="secondary-button" data-reservation-action="edit" data-reservation-id="${reservation.id}">Edit</button>
          <button type="button" class="danger-button" data-reservation-action="delete" data-reservation-id="${reservation.id}">Delete</button>
        </div>
      `;
      els.reservationList.appendChild(item);
    });
}

function handleReservationListAction(event) {
  const button = event.target.closest('[data-reservation-action]');
  if (!button || !isAdmin()) return;
  const reservation = state.reservations.find((item) => item.id === button.dataset.reservationId);
  if (!reservation) return;

  if (button.dataset.reservationAction === 'edit') {
    els.reservationListModal.close();
    openReservationModal(
      { start: new Date(reservation.start_time), end: new Date(reservation.end_time) },
      { record: reservation, type: 'reservation' }
    );
    return;
  }

  state.pendingDeleteId = reservation.id;
  els.confirmMessage.textContent = 'Delete this reservation from the CSC Conference Room schedule?';
  els.confirmModal.showModal();
}

function openActivityLog() {
  if (!isAdmin()) {
    showToast('Activity history is available to admin users.', 'error');
    return;
  }

  els.activityList.innerHTML = '';
  const logs = [...state.activityLogs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (!logs.length) {
    els.activityList.innerHTML = EMPTY_ACTIVITY_LOG;
  } else {
    logs.forEach((log) => {
      const item = document.createElement('div');
      item.className = 'activity-item';
      const description = log.description || buildActivityDescription(log);
      item.innerHTML = `
        <strong>${escapeHtml(capitalize(String(log.action || 'activity').replaceAll('_', ' ')))}</strong>
        <p>${formatDateTime(new Date(log.created_at))}</p>
        <p>${escapeHtml(description)}</p>
        <p>${escapeHtml(log.student_name || log.new_value?.reserved_by_name || 'Student not recorded')} - ${escapeHtml(log.organization || log.new_value?.organization || 'Organization not recorded')}</p>
      `;
      els.activityList.appendChild(item);
    });
  }
  els.activityLogModal.showModal();
}

function openMobileSidebar() {
  els.sidebar.classList.add('open');
  els.mobileScrim.classList.add('open');
}

function closeMobileSidebar() {
  els.sidebar.classList.remove('open');
  els.mobileScrim.classList.remove('open');
}

function defaultCreateRange() {
  const start = roundToNextHalfHour(addMinutes(new Date(), MIN_ADVANCE_HOURS * 60));
  const weekdayStart = isWeekday(start) ? start : setTime(getNextWeekday(start, 1), SCHOOL_HOURS.start);
  if (!isWithinSchoolHours(weekdayStart, addMinutes(weekdayStart, 60))) {
    return { start: setTime(getNextWeekday(weekdayStart, 1), SCHOOL_HOURS.start), end: setTime(getNextWeekday(weekdayStart, 1), '09:00') };
  }
  return { start: weekdayStart, end: addMinutes(weekdayStart, 60) };
}

function getResponsiveDefaultView() {
  return 'timeGridWeek';
}

function getAllowedView(viewName) {
  if (window.innerWidth <= MOBILE_BREAKPOINT && !MOBILE_VIEW_OPTIONS.has(viewName)) {
    return getResponsiveDefaultView();
  }
  return viewName;
}

function updateResponsiveViewOptions() {
  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
  [...els.viewSelector.options].forEach((option) => {
    const hidden = isMobile && !MOBILE_VIEW_OPTIONS.has(option.value);
    option.hidden = hidden;
    option.disabled = hidden;
  });

  if (isMobile && !MOBILE_VIEW_OPTIONS.has(els.viewSelector.value)) {
    els.viewSelector.value = getResponsiveDefaultView();
  }
}

function matchesSearch(record, term) {
  if (!term) return true;
  if (!isAdmin() && record.created_by !== state.profile?.id) {
    return [
      'reserved',
      ROOM_NAME,
      record.status
    ].some((value) => String(value || '').toLowerCase().includes(term));
  }
  return [
    record.title,
    record.organization,
    record.reserved_by_name,
    record.purpose,
    record.reason,
    record.people_involved
  ].some((value) => String(value || '').toLowerCase().includes(term));
}

function normalizeStudentNumber(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function studentNumberToAuthEmail(studentNumber) {
  return `${normalizeStudentNumber(studentNumber)}@${AUTH_EMAIL_DOMAIN}`;
}

function getSignupErrorMessage(error) {
  const message = String(error?.message || '').toLowerCase();
  if (error?.code === '23505' || message.includes('duplicate') || message.includes('already registered') || message.includes('already exists')) {
    return 'This student number already has an account.';
  }
  return error?.message || 'Account creation failed.';
}

function combineDateAndTime(dateValue, timeValue) {
  return new Date(`${dateValue}T${timeValue || '00:00'}:00`);
}

function setTime(date, timeValue) {
  const [hours, minutes] = timeValue.split(':').map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function isWithinSchoolHours(start, end) {
  const dayStart = setTime(start, SCHOOL_HOURS.start);
  const dayEnd = setTime(start, SCHOOL_HOURS.end);
  return start >= dayStart && end <= dayEnd;
}

function isWeekday(date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function getNextWeekday(date, minDaysAhead = 0) {
  const next = new Date(date);
  next.setDate(next.getDate() + minDaysAhead);
  while (!isWeekday(next)) next.setDate(next.getDate() + 1);
  return next;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function roundToNextHalfHour(date) {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  const minutes = rounded.getMinutes();
  const next = minutes === 0 || minutes === 30 ? minutes : minutes < 30 ? 30 : 60;
  if (next === 60) {
    rounded.setHours(rounded.getHours() + 1, 0, 0, 0);
  } else {
    rounded.setMinutes(next);
  }
  return rounded;
}

function formatDateInput(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatTimeInput(date) {
  return date.toTimeString().slice(0, 5);
}

function formatDateTime(date) {
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatTime(date) {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function capitalize(value) {
  return String(value || '').charAt(0).toUpperCase() + String(value || '').slice(1);
}

function initials(name) {
  return String(name || 'Guest')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

function detailsRows(rows) {
  return Object.entries(rows)
    .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join('');
}

function buildDetailsText(record, start, end, isBlocked) {
  return [
    `${isBlocked ? 'Blocked time' : 'Reservation'}: ${record.title}`,
    `Room: ${ROOM_NAME}`,
    `Time: ${formatDateTime(start)} - ${formatTime(end)}`,
    `Reserved by: ${record.reserved_by_name || 'CSC Officer/Admin'}`,
    `Purpose: ${record.purpose || record.reason || 'Not provided'}`
  ].join('\n');
}

async function copyCurrentFormDetails() {
  const formData = getReservationFormData();
  const text = buildDetailsText(
    {
      title: ROOM_NAME,
      reserved_by_name: formData.reservedBy,
      purpose: formData.purpose
    },
    formData.start,
    formData.end,
    formData.type === 'blocked'
  );
  await copyText(text);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Reservation details copied.', 'success');
  } catch {
    showToast('Copy is not available in this browser.', 'error');
  }
}

function showToast(message, type = 'info') {
  const toastHost = [...document.querySelectorAll('dialog[open]')].at(-1) || document.body;
  if (els.toastRegion.parentElement !== toastHost) {
    toastHost.appendChild(els.toastRegion);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  els.toastRegion.appendChild(toast);
  setTimeout(() => toast.remove(), 4200);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function debounce(callback, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => callback(...args), delay);
  };
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}
