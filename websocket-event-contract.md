# HCW Home WebSocket Event Contract & Onboarding Guide

---

## Table of Contents

1. [Namespaces Overview](#namespaces-overview)
2. [Event Tables by Namespace](#event-tables-by-namespace)
   - [Consultation](#consultation)
   - [Chat](#chat)
   - [Mediasoup](#mediasoup)
3. [Error Handling & Edge Cases](#error-handling--edge-cases)
4. [Onboarding Steps](#onboarding-steps)

## Namespaces Overview

| Namespace                | Description                                |
| ------------------------ | ------------------------------------------ |
| `/consultation`          | Core consultation room events              |
| `/chat`                  | Real-time chat messaging                   |
| `/mediasoup`             | WebRTC media transport and management      |
| `/enhanced-consultation` | Advanced real-time features and statistics |

---

## Event Tables by Namespace

### Consultation Namespace (`/consultation`)

| Event Name                                | Direction | Payload Example                                                                    | Description                           |
| ----------------------------------------- | --------- | ---------------------------------------------------------------------------------- | ------------------------------------- |
| `send_message`                            | emit      | `{ consultationId, userId, content, role }`                                        | Send chat message                     |
| `new_message`                             | receive   | `{ id, senderId, senderName, content, ... }`                                       | Receive new chat message              |
| `admit_patient`                           | emit      | `{ consultationId, patientId }`                                                    | Admit patient to consultation         |
| `consultation_status`                     | receive   | `{ status, participantCount, triggeredBy, initiatedBy, timestamp }`                | Consultation status update            |
| `media_session_ready`                     | receive   | `{ consultationId, timestamp, mediasoupReady }`                                    | Media session ready                   |
| `assign_practitioner`                     | emit      | `{ consultationId, practitionerId }`                                               | Assign practitioner                   |
| `practitioner_assigned`                   | receive   | `{ consultationId, practitionerId, message, status }`                              | Practitioner assigned                 |
| `consultation_ended`                      | receive   | `{ status, action, terminatedBy, deletionScheduledAt, retentionHours }`            | Consultation ended                    |
| `consultation_terminated`                 | receive   | `{ consultationId, reason }`                                                       | Consultation terminated               |
| `patient_joined`                          | receive   | `{ consultationId, patientId, patientFirstName, joinTime, message, ... }`          | Patient joined notification           |
| `participant_joined`                      | receive   | `{ type, title, description, severity, data }`                                     | Participant joined event              |
| `participant_left`                        | receive   | `{ type, title, description, severity, data }`                                     | Participant left event                |
| `heartbeat`                               | emit/recv | `{ timestamp }`                                                                    | Heartbeat ping/pong                   |
| `practitioner_online`                     | emit      | `{ practitionerId }`                                                               | Practitioner online presence          |
| `practitioner_offline`                    | emit      | `{ practitionerId }`                                                               | Practitioner offline presence         |
| `session_sync`                            | receive   | `{ consultationId, userId, role, timestamp, message }`                             | Session synchronization               |
| `session_ended`                           | receive   | `{ consultationId, userId, role, timestamp, message }`                             | Session ended notification            |
| `file_upload_progress`                    | receive   | `{ percent, fileId? }`                                                             | File upload progress                  |
| `file_upload_error`                       | receive   | `{ error, fileId? }`                                                               | File upload error                     |
| `dashboard_state_update`                  | receive   | `{ practitionerId, dashboardState, timestamp }`                                    | Dashboard state update                |
| `navigate_to_consultation_room`           | receive   | `{ url, sessionUrl, autoRedirect, message, timeout }`                              | Navigation command for patient        |
| `waiting_room_notification`               | receive   | `{ consultationId, patientId, patientFirstName, patientInitials, ... }`            | Waiting room notification             |
| `new_assignment`                          | receive   | `{ consultationId, message, status }`                                              | New assignment notification           |
| `consultation_self_assigned`              | receive   | `{ consultationId, practitionerId, message }`                                      | Practitioner self-assigned            |
| `waiting_room_consultation_assigned`      | receive   | `{ consultationId, assignedToPractitionerId, message }`                            | Waiting room consultation assigned    |
| `patient_waiting`                         | receive   | `{ consultationId, patientId, message, joinTime }`                                 | Patient waiting notification          |
| `patient_admitted`                        | receive   | `{ consultationId, patient, transition, navigation, urls, consultation }`          | Patient admitted to consultation      |
| `patient_admission_confirmed`             | receive   | `{ ...transitionEvent, practitioner: { message, dashboardUrl, ... } }`             | Practitioner admission confirmation   |
| `redirect_to_consultation_room`           | receive   | `{ consultationId, userId, redirectUrl, autoRedirect, timestamp }`                 | Redirect to consultation room         |
| `transition_to_consultation_room`         | receive   | `{ consultationId, userId, fromState, toState, timestamp }`                        | Transition to consultation room       |
| `expert_guest_joined_consultation`        | receive   | `{ consultationId, participant, joinTime, capabilities }`                          | Expert/guest joined consultation      |
| `participant_ready_for_consultation`      | receive   | `{ consultationId, participant, features, timestamp }`                             | Participant ready for consultation    |
| `participant_joined_media`                | receive   | `{ consultationId, participant, capabilities, timestamp }`                         | Participant joined media session      |
| `participant_left_media`                  | receive   | `{ consultationId, userId, role, timestamp }`                                      | Participant left media session        |
| `add_participant_enhanced`                | emit      | `{ role, email, firstName, lastName, notes? }`                                     | Add participant (enhanced)            |
| `remove_participant_enhanced`             | emit      | `{ participantUserId }`                                                            | Remove participant (enhanced)         |
| `consultation_activated`                  | receive   | `{ sessionStatus, consultationStartTime, isConnected }`                            | Consultation activated                |
| `consultation_activated_response`         | receive   | `{ success, error }`                                                               | Consultation activation response      |
| `consultation_status_update`              | receive   | `{ status, participantCount }`                                                     | Consultation status update            |
| `waiting_room_update`                     | receive   | `{ waitingCount }`                                                                 | Waiting room update                   |
| `enter_waiting_room`                      | emit      | `{ consultationId, userId }`                                                       | Enter waiting room                    |
| `admit_from_waiting_room_enhanced`        | emit      | `{ consultationId, patientId, welcomeMessage? }`                                   | Admit from waiting room (enhanced)    |
| `join_live_consultation_enhanced`         | emit      | `{ consultationId, userId, role }`                                                 | Join live consultation (enhanced)     |
| `get_practitioner_waiting_room`           | emit      | `{ practitionerId }`                                                               | Get practitioner waiting room         |
| `get_waiting_room_stats`                  | emit      | `{ practitionerId }`                                                               | Get waiting room statistics           |
| `waiting_room_heartbeat`                  | emit      | `{ waitingRoomSessionId, patientId }`                                              | Waiting room heartbeat                |
| `media_session_live`                      | receive   | `{ consultationId, timestamp, mediasoupReady }`                                    | Media session live                    |
| `media_session_initialized`               | receive   | `{ consultationId, routerId, rtpCapabilities, sessionInitialized }`                | Media session initialized             |
| `media_session_closed`                    | receive   | `{ consultationId, mediasoupCleaned }`                                             | Media session closed                  |
| `initialize_media_session`                | emit      | `{ consultationId, initiatorUserId, initiatorRole }`                               | Initialize media session              |
| `join_media_session`                      | emit      | `{ consultationId, userId, userRole }`                                             | Join media session                    |
| `leave_media_session`                     | emit      | `{ consultationId, userId, userRole }`                                             | Leave media session                   |
| `media_join_response`                     | receive   | `{ consultationId, success, canJoinMedia, mediaCapabilities, timestamp }`          | Media join response                   |
| `media_leave_response`                    | receive   | `{ consultationId, success, timestamp }`                                           | Media leave response                  |
| `participant_media_status`                | receive   | `{ participantId, mediaStatus }`                                                   | Participant media status              |
| `participant_media_capabilities_response` | receive   | `{ consultationId, userId, capabilities, inWaitingRoom, isActive, timestamp }`     | Participant media capabilities        |
| `request_participant_media_capabilities`  | emit      | `{ consultationId, userId }`                                                       | Request participant media caps        |
| `update_media_device_status`              | emit      | `{ consultationId, userId, cameraAvailable?, cameraEnabled?, ... }`                | Update media device status            |
| `participant_added`                       | receive   | `{ participant }`                                                                  | Participant added                     |
| `participant_removed`                     | receive   | `{ participantId }`                                                                | Participant removed                   |
| `start_typing`                            | emit      | `{ consultationId }`                                                               | Start typing indicator                |
| `stop_typing`                             | emit      | `{ consultationId }`                                                               | Stop typing indicator                 |
| `request_message_history`                 | emit      | `{ consultationId, limit?, offset? }`                                              | Request message history               |
| `update_typing_indicator`                 | emit      | `{ consultationId, userId, isTyping }`                                             | Update typing indicator               |
| `connect`                                 | receive   | `-`                                                                                | WebSocket connected                   |
| `disconnect`                              | receive   | `-`                                                                                | WebSocket disconnected                |
| `reconnect`                               | receive   | `-`                                                                                | WebSocket reconnected                 |
| `connect_error`                           | receive   | `{ error }`                                                                        | Connection error                      |
| `user_reconnected`                        | receive   | `{ userId, timestamp, message }`                                                   | User reconnected notification         |
| `system_notification`                     | receive   | `{ type, message, timestamp, priority, data? }`                                    | System notification                   |
| `message_read`                            | receive   | `{ messageId, userId, consultationId, readAt }`                                    | Read receipt for message              |
| `typing` / `user_typing`                  | emit/recv | `{ consultationId, userId, userName, isTyping }`                                   | Typing indicator                      |
| `consultation_status_patient`             | receive   | `{ status, canJoin, waitingForDoctor, scheduledDate, doctorName, rating }`         | Patient consultation status           |
| `connection_quality_update`               | receive   | `{ type, id, stats, userId, timestamp }`                                           | Media connection quality              |
| `message_error`                           | receive   | `{ error, timestamp }`                                                             | Chat message error                    |
| `read_receipt_error`                      | receive   | `{ error, messageId, timestamp }`                                                  | Read receipt error                    |
| `message_history`                         | receive   | `{ messages: [...], consultationId, timestamp }`                                   | Chat message history                  |
| `user_joined_chat`                        | receive   | `{ userId, consultationId, userRole, joinType, joinedAt, context }`                | User joined chat notification         |
| `user_left_chat`                          | receive   | `{ userId, consultationId, userRole, joinType, leftAt, context }`                  | User left chat notification           |
| `system_message`                          | receive   | `{ type, userId, role, timestamp, message, content, context }`                     | System message (join/leave/state)     |
| `message_edited`                          | receive   | `{ message, consultationId, timestamp }`                                           | Edited chat message                   |
| `message_deleted`                         | receive   | `{ message, consultationId, timestamp }`                                           | Deleted chat message                  |
| `patient_state_changed`                   | receive   | `{ consultationId, patientId, fromState, toState, timestamp, triggeredBy }`        | Patient state transition              |
| `all_messages_read`                       | receive   | `{ userId, consultationId, readAt }`                                               | All messages marked as read           |
| `mark_all_read`                           | emit      | `{ consultationId }`                                                               | Mark all messages as read             |
| `mark_all_read_error`                     | receive   | `{ error, timestamp }`                                                             | Mark all read error                   |
| `bulk_mark_read`                          | emit      | `{ consultationId, messageIds }`                                                   | Bulk mark messages as read            |
| `messages_bulk_read`                      | receive   | `{ messageIds, userId, consultationId, readAt }`                                   | Bulk read receipt                     |
| `edit_message`                            | emit      | `{ messageId, content, consultationId }`                                           | Edit chat message                     |
| `edit_message_error`                      | receive   | `{ error, messageId, timestamp }`                                                  | Edit message error                    |
| `delete_message`                          | emit      | `{ messageId, consultationId }`                                                    | Delete chat message                   |
| `delete_message_error`                    | receive   | `{ error, messageId, timestamp }`                                                  | Delete chat error                     |
| `patient_state_transition`                | emit      | `{ consultationId, fromState, toState, patientId }`                                | Patient state transition              |
| `state_transition_error`                  | receive   | `{ error, timestamp }`                                                             | State transition error                |
| `get_typing_users`                        | emit      | `{ consultationId }`                                                               | Get typing users                      |
| `typing_users`                            | receive   | `{ consultationId, typingUsers, timestamp }`                                       | Typing users list                     |
| `request_participants`                    | emit      | `{ consultationId }`                                                               | Request participants list             |
| `participants_list`                       | receive   | `{ consultationId, participants, timestamp }`                                      | Participants list                     |
| `participants_error`                      | receive   | `{ error, timestamp }`                                                             | Participants list error               |
| `invite_participant`                      | emit      | `{ consultationId, inviteEmail, role, name, notes }`                               | Invite participant                    |
| `participant_invited`                     | receive   | `{ consultationId, inviteEmail, role, name, notes, token, expiresAt }`             | Participant invited                   |
| `participant_invitation_sent`             | receive   | `{ consultationId, inviteEmail, role, name, notes }`                               | Participant invitation sent           |
| `join_via_invite`                         | emit      | `{ token, userId }`                                                                | Join via invitation                   |
| `participant_invite_joined`               | receive   | `{ userId, consultationId, role, joinedAt }`                                       | Participant joined via invite         |
| `end_consultation`                        | emit      | `{ consultationId, action }`                                                       | End consultation                      |
| `rate_consultation`                       | emit      | `{ consultationId, rating, comment }`                                              | Rate consultation                     |
| `consultation_rated`                      | receive   | `{ consultationId, patientId, rating }`                                            | Consultation rated                    |
| `consultation_keep_alive`                 | emit      | `{ consultationId }`                                                               | Keep consultation alive               |
| `media_permission_status`                 | emit      | `{ consultationId, userId, camera, microphone }`                                   | Media permission status               |
| `media_permission_status_update`          | receive   | `{ userId, role, camera, microphone, timestamp }`                                  | Media permission status update        |
| `media_permission_denied`                 | emit      | `{ consultationId, userId, camera, microphone }`                                   | Media permission denied               |
| `media_permission_denied_notification`    | receive   | `{ userId, role, camera, microphone, timestamp, message }`                         | Media permission denied notification  |
| `media_permission_error_enhanced`         | emit      | `{ consultationId, userId, errorType, errorDetails }`                              | Enhanced media permission error       |
| `media_permission_guidance`               | receive   | `{ consultationId, userId, guidanceType, message, actions }`                       | Media permission guidance             |
| `collect_stats`                           | emit      | `{ consultationId, stats: { type, id, stats } }`                                   | Collect media stats                   |
| `connection_quality_updated`              | receive   | `{ consultationId, userId, quality, timestamp }`                                   | Connection quality updated            |
| `connection_quality_warning`              | receive   | `{ consultationId, userId, qualityLevel, message, guidance }`                      | Connection quality warning            |
| `update_connection_quality`               | emit      | `{ consultationId, packetLoss?, latency?, reconnectAttempts?, ... }`               | Update connection quality             |
| `getRouterCapabilities`                   | emit      | `{ consultationId }`                                                               | Get mediasoup router capabilities     |
| `createTransport`                         | emit      | `{ consultationId, type }`                                                         | Create mediasoup transport            |
| `connectTransport`                        | emit      | `{ transportId, dtlsParameters }`                                                  | Connect mediasoup transport           |
| `produce`                                 | emit      | `{ consultationId, transportId, kind, rtpParameters, appData }`                    | Produce media stream                  |
| `consume`                                 | emit      | `{ consultationId, transportId, producerId, rtpCapabilities }`                     | Consume media stream                  |
| `closeTransport`                          | emit      | `{ transportId }`                                                                  | Close mediasoup transport             |
| `client_error`                            | emit      | `{ consultationId, userId, errorMessage }`                                         | Client media error                    |
| `client_reconnect`                        | emit      | `{ consultationId, userId }`                                                       | Client media reconnect                |
| `invite_participant_email`                | emit      | `{ consultationId, inviteEmail, role }`                                            | Invite participant via email          |
| `request_consultation_state`              | emit      | `{ consultationId }`                                                               | Request consultation state            |
| `update_participant_status`               | emit      | `{ consultationId, userId, status }`                                               | Update participant status             |
| `participant_status_changed`              | receive   | `{ consultationId, userId, status, timestamp }`                                    | Participant status changed            |
| `share_screen_request`                    | emit      | `{ consultationId, userId }`                                                       | Request screen share permission       |
| `request_media_session_status`            | emit      | `{ consultationId }`                                                               | Request media session status          |
| `transition_consultation_state`           | emit      | `{ consultationId, newStatus, initiatorUserId }`                                   | Transition consultation state         |
| `activate_consultation`                   | emit      | `{ consultationId, practitionerId }`                                               | Activate consultation                 |
| `smart_patient_join`                      | emit      | `{ consultationId, patientId, joinType }`                                          | Smart patient join request            |
| `check_patient_admission_status`          | emit      | `{ consultationId, patientId }`                                                    | Check patient admission status        |
| `check_session_status`                    | emit      | `{ consultationId, patientId }`                                                    | Check session status                  |
| `join_practitioner_room`                  | emit      | `{ practitionerId }`                                                               | Join practitioner-specific room       |
| `send_enhanced_message`                   | emit      | `{ consultationId, userId, content, messageType?, metadata? }`                     | Send enhanced message                 |
| `update_typing_indicator_enhanced`        | emit      | `{ consultationId, userId, isTyping }`                                             | Update typing indicator (enhanced)    |
| `join_waiting_room_enhanced`              | emit      | `{ consultationId, userId }`                                                       | Join waiting room (enhanced)          |
| `add_participant`                         | emit      | `{ consultationId, role, email, firstName, lastName, notes? }`                     | Add participant                       |
| `remove_participant`                      | emit      | `{ participantUserId }`                                                            | Remove participant                    |
| `media_permission_error`                  | emit      | `{ consultationId, userId, errorType, errorMessage }`                              | Media permission error                |
| `toggle_video`                            | emit      | `{ consultationId, userId, videoEnabled }`                                         | Toggle video                          |
| `participant_video_toggled`               | receive   | `{ userId, videoEnabled, consultationId, timestamp }`                              | Participant video toggled             |
| `toggle_audio`                            | emit      | `{ consultationId, userId, audioEnabled }`                                         | Toggle audio                          |
| `participant_audio_toggled`               | receive   | `{ userId, audioEnabled, consultationId, timestamp }`                              | Participant audio toggled             |
| `create_system_notification`              | emit      | `{ consultationId, notificationType, message, priority }`                          | Create system notification            |
| `create_system_notification_enhanced`     | emit      | `{ consultationId, notificationType, message, priority, createdBy }`               | Create system notification (enhanced) |
| `consultation_state_update`               | receive   | `{ consultationId, status, participants, messages, timestamp }`                    | Consultation state update             |
| `consultation_state_transition_failed`    | receive   | `{ error, timestamp }`                                                             | Consultation state transition failed  |
| `screen_share_denied`                     | receive   | `{ reason, message }`                                                              | Screen share request denied           |
| `screen_share_started`                    | receive   | `{ consultationId, userId, userName, timestamp }`                                  | Screen share started                  |
| `media_session_status_response`           | receive   | `{ consultationId, participants, health, timestamp }`                              | Media session status response         |
| `session_status_response`                 | receive   | `{ success, data/error, consultationId, patientId, consultation, ... }`            | Session status response               |
| `smart_patient_join_response`             | receive   | `{ success, consultationId, patientId, joinType, redirectTo, ... }`                | Smart patient join response           |
| `smart_patient_join_error`                | receive   | `{ error, consultationId, patientId, joinType, timestamp }`                        | Smart patient join error              |
| `patient_join_state_change`               | receive   | `{ consultationId, patientId, joinType, newState, consultationStatus, timestamp }` | Patient join state change             |
| `patient_admission_status_response`       | receive   | `{ consultationId, patientId, consultationStatus, inWaitingRoom, ... }`            | Patient admission status response     |
| `patient_admission_status_error`          | receive   | `{ error, consultationId, patientId, timestamp }`                                  | Patient admission status error        |
| `waiting_room_entered`                    | receive   | `{ session, message }`                                                             | Waiting room entered confirmation     |
| `waiting_room_joined`                     | receive   | `{ success, waitingRoomSession, message }`                                         | Waiting room joined confirmation      |
| `admitted_to_live_consultation`           | receive   | `{ message, consultationId, admittedBy, admittedAt }`                              | Admitted to live consultation         |
| `patient_admitted_from_waiting_room`      | receive   | `{ patientId, consultationId, admittedBy, success }`                               | Patient admitted from waiting room    |
| `live_consultation_joined`                | receive   | `{ liveConsultationData, message }`                                                | Live consultation joined              |
| `participant_joined_live`                 | receive   | `{ userId, userRole, consultationId, joinedAt }`                                   | Participant joined live               |
| `practitioner_waiting_room_data`          | receive   | `{ waitingRoomData, timestamp }`                                                   | Practitioner waiting room data        |
| `waiting_room_heartbeat_ack`              | receive   | `{ sessionId, timestamp }`                                                         | Waiting room heartbeat acknowledgment |
| `poor_connection_detected`                | receive   | `{ affectedUserId, connectionData, consultationId, message }`                      | Poor connection detected              |
| `media_device_status_updated`             | receive   | `{ userId, deviceStatus, consultationId }`                                         | Media device status updated           |
| `enhanced_message_received`               | receive   | `{ message, consultationId, senderId }`                                            | Enhanced message received             |
| `typing_indicator_updated`                | receive   | `{ userId, isTyping, consultationId }`                                             | Typing indicator updated              |
| `removed_from_consultation`               | receive   | `{ message, removedBy, consultationId }`                                           | Removed from consultation             |
| `participant_removed_notification`        | receive   | `{ participantId, removedBy, consultationId, timestamp }`                          | Participant removed notification      |
| `media_permission_error_occurred`         | receive   | `{ userId, errorType, errorMessage, consultationId }`                              | Media permission error occurred       |
| `system_notification_created`             | receive   | `{ notificationType, message, priority, createdBy, consultationId, timestamp }`    | System notification created           |
| `patient_entered_waiting_room`            | receive   | `{ waitingRoomSession, patientId, joinedAt }`                                      | Patient entered waiting room          |
| `patient_in_waiting_room`                 | receive   | `{ consultationId, patient, estimatedWaitTime }`                                   | Patient in waiting room               |
| `add_participant_success`                 | receive   | `{ success, participant }`                                                         | Participant added successfully        |
| `connection_guidance`                     | receive   | `{ qualityLevel, message, guidance, timestamp }`                                   | Connection quality guidance           |
| `participant_connection_quality`          | receive   | `{ userId, quality, stats, timestamp }`                                            | Participant connection quality        |
| `doctor_joined`                           | receive   | `{ consultationId, practitionerId, message }`                                      | Doctor/practitioner joined event      |
| `mediaAction`                             | emit      | `{ action, data }`                                                                 | Media action (legacy)                 |

### Chat Namespace (`/chat`)

| Event Name                 | Direction | Payload Example                                                             | Description                       |
| -------------------------- | --------- | --------------------------------------------------------------------------- | --------------------------------- |
| `send_message`             | emit      | `{ consultationId, userId, content, messageType?, metadata? }`              | Send enhanced message             |
| `new_message`              | receive   | `{ ...message, id, senderId, senderName, content, timestamp }`              | New message in consultation room  |
| `typing_indicator`         | emit      | `{ consultationId, userId, isTyping }`                                      | Enhanced typing indicator         |
| `typing_indicator_updated` | receive   | `{ userId, isTyping, consultationId }`                                      | Typing indicator updated          |
| `message_read`             | receive   | `{ messageId, userId, consultationId, readAt }`                             | Read receipt for message          |
| `message_error`            | receive   | `{ error, timestamp }`                                                      | Chat message error                |
| `connect`                  | receive   | `-`                                                                         | WebSocket connected               |
| `disconnect`               | receive   | `-`                                                                         | WebSocket disconnected            |
| `reconnect`                | receive   | `-`                                                                         | WebSocket reconnected             |
| `connect_error`            | receive   | `{ error }`                                                                 | Connection error                  |
| `read_receipt_error`       | receive   | `{ error, messageId, timestamp }`                                           | Read receipt error                |
| `message_history`          | receive   | `{ messages: [...], consultationId, timestamp }`                            | Chat message history              |
| `message_history_error`    | receive   | `{ error, timestamp }`                                                      | Message history error             |
| `user_typing`              | emit/recv | `{ consultationId, userId }`                                                | User typing indicator             |
| `user_joined_chat`         | receive   | `{ userId, consultationId, userRole, joinType, joinedAt, context }`         | User joined chat notification     |
| `user_left_chat`           | receive   | `{ userId, consultationId, userRole, joinType, leftAt, context }`           | User left chat notification       |
| `system_message`           | receive   | `{ type, userId, role, timestamp, message, content, context }`              | System message (join/leave/state) |
| `message_edited`           | receive   | `{ message, consultationId, timestamp }`                                    | Edited chat message               |
| `message_deleted`          | receive   | `{ message, consultationId, timestamp }`                                    | Deleted chat message              |
| `all_messages_read`        | receive   | `{ userId, consultationId, readAt }`                                        | All messages marked as read       |
| `mark_all_read`            | emit      | `{ consultationId }`                                                        | Mark all messages as read         |
| `mark_all_read_error`      | receive   | `{ error, timestamp }`                                                      | Mark all read error               |
| `bulk_mark_read`           | emit      | `{ consultationId, messageIds }`                                            | Bulk mark messages as read        |
| `messages_bulk_read`       | receive   | `{ messageIds, userId, consultationId, readAt }`                            | Bulk read receipt                 |
| `bulk_read_error`          | receive   | `{ error, timestamp }`                                                      | Bulk read error                   |
| `edit_message`             | emit      | `{ messageId, content, consultationId }`                                    | Edit chat message                 |
| `edit_message_error`       | receive   | `{ error, messageId, timestamp }`                                           | Edit message error                |
| `delete_message`           | emit      | `{ messageId, consultationId }`                                             | Delete chat message               |
| `delete_message_error`     | receive   | `{ error, messageId, timestamp }`                                           | Delete chat error                 |
| `patient_state_transition` | emit      | `{ consultationId, fromState, toState, patientId }`                         | Patient state transition          |
| `patient_state_changed`    | receive   | `{ consultationId, patientId, fromState, toState, timestamp, triggeredBy }` | Patient state changed             |
| `state_transition_error`   | receive   | `{ error, timestamp }`                                                      | State transition error            |
| `get_typing_users`         | emit      | `{ consultationId }`                                                        | Get typing users                  |
| `typing_users`             | receive   | `{ consultationId, typingUsers, timestamp }`                                | Typing users list                 |
| `request_participants`     | emit      | `{ consultationId }`                                                        | Request participants list         |
| `participants_list`        | receive   | `{ consultationId, participants, timestamp }`                               | Participants list                 |
| `participants_error`       | receive   | `{ error, timestamp }`                                                      | Participants list error           |
| `start_typing`             | emit      | `{ consultationId }`                                                        | Start typing indicator            |
| `stop_typing`              | emit      | `{ consultationId }`                                                        | Stop typing indicator             |
| `request_message_history`  | emit      | `{ consultationId, limit?, offset? }`                                       | Request message history           |
| `mark_message_read`        | emit      | `{ consultationId, messageId, userId }`                                     | Mark message as read              |
| `error`                    | receive   | `{ message }`                                                               | Generic error event               |

### Mediasoup Namespace (`/mediasoup`)

| Event Name                             | Direction | Payload Example                                                     | Description                          |
| -------------------------------------- | --------- | ------------------------------------------------------------------- | ------------------------------------ |
| `getRouterCapabilities`                | emit      | `{ consultationId }`                                                | Get mediasoup router capabilities    |
| `createTransport`                      | emit      | `{ consultationId, type }`                                          | Create mediasoup transport           |
| `connectTransport`                     | emit      | `{ transportId, dtlsParameters }`                                   | Connect mediasoup transport          |
| `produce`                              | emit      | `{ consultationId, transportId, kind, rtpParameters, appData }`     | Produce media stream                 |
| `consume`                              | emit      | `{ consultationId, transportId, producerId, rtpCapabilities }`      | Consume media stream                 |
| `closeTransport`                       | emit      | `{ transportId }`                                                   | Close mediasoup transport            |
| `media_session_ready`                  | receive   | `{ routerId, rtpCapabilities, canJoinMedia, mediaInitialized }`     | Media session ready                  |
| `media_session_live`                   | receive   | `{ consultationId, timestamp, mediasoupReady }`                     | Media session live                   |
| `client_error`                         | emit      | `{ consultationId, userId, errorMessage }`                          | Client media error                   |
| `client_reconnect`                     | emit      | `{ consultationId, userId }`                                        | Client media reconnect               |
| `media_session_initialized`            | receive   | `{ consultationId, routerId, rtpCapabilities, sessionInitialized }` | Media session initialized            |
| `media_session_closed`                 | receive   | `{ consultationId, mediasoupCleaned }`                              | Media session closed                 |
| `media_permission_status`              | emit      | `{ consultationId, userId, camera, microphone }`                    | Media permission status              |
| `media_permission_status_update`       | receive   | `{ userId, role, camera, microphone, timestamp }`                   | Media permission status update       |
| `media_permission_denied`              | emit      | `{ consultationId, userId, camera, microphone }`                    | Media permission denied              |
| `media_permission_denied_notification` | receive   | `{ userId, role, camera, microphone, timestamp, message }`          | Media permission denied notification |
| `collect_stats`                        | emit      | `{ consultationId, stats: { type, id, stats } }`                    | Collect media stats                  |
| `connection_quality_update`            | receive   | `{ type, id, stats, userId, timestamp }`                            | Media connection quality update      |
| `invite_participant_email`             | emit      | `{ consultationId, inviteEmail, role }`                             | Invite participant via email         |
| `join_via_invite`                      | emit      | `{ token, userId? }`                                                | Join via media invitation            |
| `participant_invited`                  | receive   | `{ consultationId, inviteEmail, role, invitationId, expiresAt }`    | Participant invited                  |
| `participant_joined`                   | receive   | `{ consultationId, userId, role, joinedAt }`                        | Participant joined                   |
| `connect`                              | receive   | `-`                                                                 | WebSocket connected                  |
| `disconnect`                           | receive   | `-`                                                                 | WebSocket disconnected               |
| `reconnect`                            | receive   | `-`                                                                 | WebSocket reconnected                |
| `connect_error`                        | receive   | `{ error }`                                                         | Connection error                     |
| `mediaAction`                          | emit      | `{ action, data }`                                                  | Media action (legacy)                |

### Enhanced Consultation Namespace (`/enhanced-consultation`)

| Event Name                             | Direction | Payload Example                                                                                                                      | Description                           |
| -------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| `user_reconnected`                     | receive   | `{ userId, timestamp, message }`                                                                                                     | User reconnected notification         |
| `system_notification`                  | receive   | `{ type, message, timestamp, priority, data? }`                                                                                      | System notification                   |
| `patient_in_waiting_room`              | receive   | `{ consultationId, patient, estimatedWaitTime }`                                                                                     | Patient in waiting room               |
| `doctor_joined`                        | receive   | `{ consultationId, practitionerId, message }`                                                                                        | Doctor/practitioner joined event      |
| `activate_consultation`                | emit      | `{ consultationId, practitionerId }`                                                                                                 | Activate consultation                 |
| `consultation_activated`               | receive   | `{ consultationId, practitionerId, practitionerName, status, ... }`                                                                  | Consultation activated event          |
| `smart_patient_join_response`          | receive   | `{ success, consultationId, patientId, joinType, ... }`                                                                              | Smart patient join response           |
| `patient_join_state_change`            | receive   | `{ consultationId, patientId, joinType, newState, ... }`                                                                             | Patient join state change             |
| `waiting-room-update`                  | receive   | `{ waitingCount, patients, timestamp }`                                                                                              | Waiting room update                   |
| `position-update`                      | receive   | `{ patientId, position, timestamp }`                                                                                                 | Patient position update               |
| `consultation-started`                 | receive   | `{ consultationId, startedAt, practitionerId }`                                                                                      | Consultation started                  |
| `consultation-ended`                   | receive   | `{ consultationId, endedAt, practitionerId }`                                                                                        | Consultation ended                    |
| `practitioner-joined`                  | receive   | `{ practitionerId, consultationId, joinedAt }`                                                                                       | Practitioner joined                   |
| `practitioner-left`                    | receive   | `{ practitionerId, consultationId, leftAt }`                                                                                         | Practitioner left                     |
| `consultation-cancelled`               | receive   | `{ consultationId, cancelledAt, reason }`                                                                                            | Consultation cancelled                |
| `media-permission-request`             | receive   | `{ consultationId, userId, permissionType, requestedAt }`                                                                            | Media permission request              |
| `pong`                                 | receive   | `{ timestamp }`                                                                                                                      | Heartbeat pong response               |
| `ping`                                 | emit      | `{ timestamp }`                                                                                                                      | Heartbeat ping request                |
| `patient_entered_waiting_room`         | receive   | `{ waitingRoomSession, patientId, joinedAt }`                                                                                        | Patient entered waiting room          |
| `check_session_status`                 | emit      | `{ consultationId, patientId }`                                                                                                      | Check session status                  |
| `session_status_response`              | receive   | `{ success, data/error, consultationId, patientId, consultation, participant, navigation, urls, config, timestamp }`                 | Session status response               |
| `join_practitioner_room`               | emit      | `{ practitionerId }`                                                                                                                 | Join practitioner-specific room       |
| `check_patient_admission_status`       | emit      | `{ consultationId, patientId }`                                                                                                      | Check patient admission status        |
| `smart_patient_join`                   | emit      | `{ consultationId, patientId, joinType }`                                                                                            | Smart patient join request            |
| `heartbeat`                            | emit/recv | `{ timestamp }`                                                                                                                      | Server heartbeat                      |
| `connection_guidance`                  | receive   | `{ qualityLevel, message, guidance, timestamp }`                                                                                     | Connection quality guidance           |
| `participant_connection_quality`       | receive   | `{ userId, quality, stats, timestamp }`                                                                                              | Participant connection quality        |
| `new_message`                          | receive   | `{ ...message, id, senderId, senderName, content, timestamp }`                                                                       | New message in consultation room      |
| `add_participant_success`              | receive   | `{ success, participant }`                                                                                                           | Participant added successfully        |
| `participant_removed_notification`     | receive   | `{ participantId, removedBy, consultationId, timestamp }`                                                                            | Participant removed notification      |
| `participant_video_toggled`            | receive   | `{ userId, videoEnabled, consultationId, timestamp }`                                                                                | Participant video toggled             |
| `participant_audio_toggled`            | receive   | `{ userId, audioEnabled, consultationId, timestamp }`                                                                                | Participant audio toggled             |
| `media_session_status_response`        | receive   | `{ consultationId, participants, health, timestamp }`                                                                                | Media session status response         |
| `consultation_state_transition_failed` | receive   | `{ error, timestamp }`                                                                                                               | Consultation state transition failed  |
| `screen_share_denied`                  | receive   | `{ reason, message }`                                                                                                                | Screen share request denied           |
| `screen_share_started`                 | receive   | `{ consultationId, userId, userName, timestamp }`                                                                                    | Screen share started                  |
| `consultation_state_update`            | receive   | `{ consultationId, status, participants, messages, timestamp }`                                                                      | Consultation state update             |
| `update_participant_status`            | emit      | `{ consultationId, userId, status }`                                                                                                 | Update participant status             |
| `participant_status_changed`           | receive   | `{ consultationId, userId, status, timestamp }`                                                                                      | Participant status changed            |
| `request_consultation_state`           | emit      | `{ consultationId }`                                                                                                                 | Request consultation state            |
| `share_screen_request`                 | emit      | `{ consultationId, userId }`                                                                                                         | Request screen share permission       |
| `request_media_session_status`         | emit      | `{ consultationId }`                                                                                                                 | Request media session status          |
| `transition_consultation_state`        | emit      | `{ consultationId, newStatus, initiatorUserId }`                                                                                     | Transition consultation state         |
| `enter_waiting_room`                   | emit      | `{ consultationId, userId }`                                                                                                         | Enter enhanced waiting room           |
| `admit_patient`                        | emit      | `{ consultationId, patientId, welcomeMessage? }`                                                                                     | Admit patient (enhanced)              |
| `get_waiting_room_stats`               | emit      | `{ practitionerId }`                                                                                                                 | Get waiting room statistics           |
| `update_media_device_status`           | emit      | `{ consultationId, userId, cameraAvailable?, cameraEnabled?, microphoneAvailable?, etc. }`                                           | Update media device status            |
| `update_connection_quality`            | emit      | `{ consultationId, packetLoss?, latency?, reconnectAttempts?, signalStrength? }`                                                     | Update connection quality             |
| `send_message`                         | emit      | `{ consultationId, userId, content, messageType?, metadata? }`                                                                       | Send enhanced message                 |
| `send_enhanced_message`                | emit      | `{ consultationId, userId, content, messageType?, metadata? }`                                                                       | Send enhanced message (alt)           |
| `typing_indicator`                     | emit      | `{ consultationId, userId, isTyping }`                                                                                               | Enhanced typing indicator             |
| `update_typing_indicator_enhanced`     | emit      | `{ consultationId, userId, isTyping }`                                                                                               | Update typing indicator (enhanced)    |
| `add_participant`                      | emit      | `{ consultationId, role, email, firstName, lastName, notes? }`                                                                       | Add participant (enhanced)            |
| `add_participant_enhanced`             | emit      | `{ role, email, firstName, lastName, notes? }`                                                                                       | Add participant (enhanced alt)        |
| `remove_participant_enhanced`          | emit      | `{ participantUserId }`                                                                                                              | Remove participant (enhanced)         |
| `patient_waiting`                      | receive   | `{ patientId, session, consultationId, message }`                                                                                    | Enhanced patient waiting              |
| `connection_quality_warning`           | receive   | `{ consultationId, userId, qualityLevel, message, guidance }`                                                                        | Connection quality warning            |
| `media_permission_guidance`            | receive   | `{ consultationId, userId, guidanceType, message, actions }`                                                                         | Media permission guidance             |
| `smart_patient_join_error`             | receive   | `{ error, consultationId, patientId, joinType, timestamp }`                                                                          | Smart patient join error              |
| `patient_admission_status_response`    | receive   | `{ consultationId, patientId, consultationStatus, inWaitingRoom, isActive, canJoinDirectly, recommendedAction, message, timestamp }` | Patient admission status response     |
| `patient_admission_status_error`       | receive   | `{ error, consultationId, patientId, timestamp }`                                                                                    | Patient admission status error        |
| `waiting_room_entered`                 | receive   | `{ session, message }`                                                                                                               | Waiting room entered confirmation     |
| `waiting_room_joined`                  | receive   | `{ success, waitingRoomSession, message }`                                                                                           | Waiting room joined confirmation      |
| `admitted_to_live_consultation`        | receive   | `{ message, consultationId, admittedBy, admittedAt }`                                                                                | Admitted to live consultation         |
| `patient_admitted_from_waiting_room`   | receive   | `{ patientId, consultationId, admittedBy, success }`                                                                                 | Patient admitted from waiting room    |
| `live_consultation_joined`             | receive   | `{ liveConsultationData, message }`                                                                                                  | Live consultation joined              |
| `participant_joined_live`              | receive   | `{ userId, userRole, consultationId, joinedAt }`                                                                                     | Participant joined live               |
| `practitioner_waiting_room_data`       | receive   | `{ waitingRoomData, timestamp }`                                                                                                     | Practitioner waiting room data        |
| `waiting_room_heartbeat_ack`           | receive   | `{ sessionId, timestamp }`                                                                                                           | Waiting room heartbeat acknowledgment |
| `poor_connection_detected`             | receive   | `{ affectedUserId, connectionData, consultationId, message }`                                                                        | Poor connection detected              |
| `media_device_status_updated`          | receive   | `{ userId, deviceStatus, consultationId }`                                                                                           | Media device status updated           |
| `enhanced_message_received`            | receive   | `{ message, consultationId, senderId }`                                                                                              | Enhanced message received             |
| `typing_indicator_updated`             | receive   | `{ userId, isTyping, consultationId }`                                                                                               | Typing indicator updated              |
| `participant_invited`                  | receive   | `{ email, role, invitationId, addedBy, consultationId }`                                                                             | Participant invited (enhanced)        |
| `removed_from_consultation`            | receive   | `{ message, removedBy, consultationId }`                                                                                             | Removed from consultation             |
| `participant_removed`                  | receive   | `{ participantUserId, removedBy, consultationId }`                                                                                   | Participant removed notification      |
| `media_permission_error_occurred`      | receive   | `{ userId, errorType, errorMessage, consultationId }`                                                                                | Media permission error occurred       |
| `system_notification_created`          | receive   | `{ notificationType, message, priority, createdBy, consultationId, timestamp }`                                                      | System notification created           |
| `join_waiting_room_enhanced`           | emit      | `{ consultationId, userId }`                                                                                                         | Join waiting room (enhanced)          |
| `admit_from_waiting_room_enhanced`     | emit      | `{ consultationId, patientId, welcomeMessage? }`                                                                                     | Admit from waiting room (enhanced)    |
| `join_live_consultation_enhanced`      | emit      | `{ consultationId, userId, role }`                                                                                                   | Join live consultation (enhanced)     |
| `get_practitioner_waiting_room`        | emit      | `{ practitionerId }`                                                                                                                 | Get practitioner waiting room         |
| `waiting_room_heartbeat`               | emit      | `{ waitingRoomSessionId, patientId }`                                                                                                | Waiting room heartbeat                |
| `media_permission_error_enhanced`      | emit      | `{ consultationId, userId, errorType, errorDetails }`                                                                                | Enhanced media permission error       |
| `create_system_notification_enhanced`  | emit      | `{ consultationId, notificationType, message, priority, createdBy }`                                                                 | Create system notification (enhanced) |
| `error`                                | receive   | `{ message, timestamp? }`                                                                                                            | Generic error event                   |

---

### Consultation Namespace Events

| Event Name | Direction | Payload | Description |
|------------|-----------|---------|-------------|
| `media_session_ready` | receive | `{ routerId, rtpCapabilities, canJoinMedia, mediaInitialized }` | Media session ready |
| `smart_patient_join_response` | receive | `{ success, consultationId, patientId, joinType, ... }` | Smart patient join response |
| `patient_join_state_change` | receive | `{ consultationId, patientId, joinType, newState, ... }` | Patient join state change |
| `waiting-room-update` | receive | `{ waitingCount, patients, timestamp }` | Waiting room update |
| `position-update` | receive | `{ patientId, position, timestamp }` | Patient position update |
| `consultation-started` | receive | `{ consultationId, startedAt, practitionerId }` | Consultation started |
| `consultation-ended` | receive | `{ consultationId, endedAt, practitionerId }` | Consultation ended |
| `practitioner-joined` | receive | `{ practitionerId, consultationId, joinedAt }` | Practitioner joined |
| `practitioner-left` | receive | `{ practitionerId, consultationId, leftAt }` | Practitioner left |
| `consultation-cancelled` | receive | `{ consultationId, cancelledAt, reason }` | Consultation cancelled |
| `media-permission-request` | receive | `{ consultationId, userId, permissionType, requestedAt }` | Media permission request |
| `pong` | receive | `{ timestamp }` | Heartbeat pong response |
| `ping` | emit | `{ timestamp }` | Heartbeat ping request |
| `patient_entered_waiting_room` | receive | `{ waitingRoomSession, patientId, joinedAt }` | Patient entered waiting room |
| `check_session_status` | emit | `{ consultationId, patientId }` | Check session status |
| `session_status_response` | receive | `{ success, data/error, consultationId, patientId, consultation, participant, navigation, urls, config, timestamp }` | Session status response |
| `join_practitioner_room` | emit | `{ practitionerId }` | Join practitioner-specific room |
| `check_patient_admission_status` | emit | `{ consultationId, patientId }` | Check patient admission status |
| `smart_patient_join` | emit | `{ consultationId, patientId, joinType }` | Smart patient join request |
| `heartbeat` | emit/recv | `{ timestamp }` | Server heartbeat |
| `connection_guidance` | receive | `{ qualityLevel, message, guidance, timestamp }` | Connection quality guidance |
| `participant_connection_quality` | receive | `{ userId, quality, stats, timestamp }` | Participant connection quality |
| `new_message` | receive | `{ ...message, id, senderId, senderName, content, timestamp }` | New message in consultation room |
| `add_participant_success` | receive | `{ success, participant }` | Participant added successfully |
| `participant_removed_notification`| receive | `{ participantId, removedBy, consultationId, timestamp }` | Participant removed notification |
| `participant_video_toggled` | receive | `{ userId, videoEnabled, consultationId, timestamp }` | Participant video toggled |
| `participant_audio_toggled` | receive | `{ userId, audioEnabled, consultationId, timestamp }` | Participant audio toggled |
| `media_session_status_response` | receive | `{ consultationId, participants, health, timestamp }` | Media session status response |
| `consultation_state_transition_failed` | receive | `{ error, timestamp }` | Consultation state transition failed |
| `screen_share_denied` | receive | `{ reason, message }` | Screen share request denied |
| `screen_share_started` | receive | `{ consultationId, userId, userName, timestamp }` | Screen share started |
| `consultation_state_update` | receive | `{ consultationId, status, participants, messages, timestamp }` | Consultation state update |
| `update_participant_status` | emit | `{ consultationId, userId, status }` | Update participant status |
| `participant_status_changed` | receive | `{ consultationId, userId, status, timestamp }` | Participant status changed |
| `request_consultation_state` | emit | `{ consultationId }` | Request consultation state |
| `share_screen_request` | emit | `{ consultationId, userId }` | Request screen share permission |
| `request_media_session_status` | emit | `{ consultationId }` | Request media session status |
| `transition_consultation_state` | emit | `{ consultationId, newStatus, initiatorUserId }` | Transition consultation state |
| `enter_waiting_room` | emit | `{ consultationId, userId }` | Enter enhanced waiting room |
| `admit_patient` | emit | `{ consultationId, patientId, welcomeMessage? }` | Admit patient (enhanced) |
| `get_waiting_room_stats` | emit | `{ practitionerId }` | Get waiting room statistics |
| `update_media_device_status` | emit | `{ consultationId, userId, cameraAvailable?, cameraEnabled?, microphoneAvailable?, etc. }` | Update media device status |
| `update_connection_quality` | emit | `{ consultationId, packetLoss?, latency?, reconnectAttempts?, signalStrength? }` | Update connection quality |
| `send_message` | emit | `{ consultationId, userId, content, messageType?, metadata? }` | Send enhanced message |
| `send_enhanced_message` | emit | `{ consultationId, userId, content, messageType?, metadata? }` | Send enhanced message (alt) |
| `typing_indicator` | emit | `{ consultationId, userId, isTyping }` | Enhanced typing indicator |
| `update_typing_indicator_enhanced` | emit | `{ consultationId, userId, isTyping }` | Update typing indicator (enhanced) |
| `add_participant` | emit | `{ consultationId, role, email, firstName, lastName, notes? }` | Add participant (enhanced) |
| `add_participant_enhanced` | emit | `{ role, email, firstName, lastName, notes? }` | Add participant (enhanced alt) |
| `remove_participant_enhanced` | emit | `{ participantUserId }` | Remove participant (enhanced) |
| `patient_waiting` | receive | `{ patientId, session, consultationId, message }` | Enhanced patient waiting |
| `connection_quality_warning` | receive | `{ consultationId, userId, qualityLevel, message, guidance }` | Connection quality warning |
| `media_permission_guidance` | receive | `{ consultationId, userId, guidanceType, message, actions }` | Media permission guidance |
| `smart_patient_join_error` | receive | `{ error, consultationId, patientId, joinType, timestamp }` | Smart patient join error |
| `patient_admission_status_response` | receive | `{ consultationId, patientId, consultationStatus, inWaitingRoom, isActive, canJoinDirectly, recommendedAction, message, timestamp }` | Patient admission status response |
| `patient_admission_status_error` | receive | `{ error, consultationId, patientId, timestamp }` | Patient admission status error |
| `waiting_room_entered` | receive | `{ session, message }` | Waiting room entered confirmation |
| `waiting_room_joined` | receive | `{ success, waitingRoomSession, message }` | Waiting room joined confirmation |
| `admitted_to_live_consultation` | receive | `{ message, consultationId, admittedBy, admittedAt }` | Admitted to live consultation |
| `patient_admitted_from_waiting_room` | receive | `{ patientId, consultationId, admittedBy, success }` | Patient admitted from waiting room |
| `live_consultation_joined` | receive | `{ liveConsultationData, message }` | Live consultation joined |
| `participant_joined_live` | receive | `{ userId, userRole, consultationId, joinedAt }` | Participant joined live |
| `practitioner_waiting_room_data` | receive | `{ waitingRoomData, timestamp }` | Practitioner waiting room data |
| `waiting_room_heartbeat_ack` | receive | `{ sessionId, timestamp }` | Waiting room heartbeat acknowledgment |
| `poor_connection_detected` | receive | `{ affectedUserId, connectionData, consultationId, message }` | Poor connection detected |
| `media_device_status_updated` | receive | `{ userId, deviceStatus, consultationId }` | Media device status updated |
| `enhanced_message_received` | receive | `{ message, consultationId, senderId }` | Enhanced message received |
| `typing_indicator_updated` | receive | `{ userId, isTyping, consultationId }` | Typing indicator updated |
| `participant_invited` | receive | `{ email, role, invitationId, addedBy, consultationId }` | Participant invite(enhanced) |
| `removed_from_consultation` | receive | `{ message, removedBy, consultationId }` | Removed from consultation |
| `participant_removed` | receive | `{ participantUserId, removedBy, consultationId }` | Participant removed notification |
| `media_permission_error_occurred` | receive | `{ userId, errorType, errorMessage, consultationId }` | Media permission error occurred |
| `system_notification_created` | receive | `{ notificationType, message, priority, createdBy, consultationId, timestamp }` | System notification created |
| `activate_consultation` | emit | `{ consultationId, practitionerId }` | Activate consultation |
| `consultation_activated` | receive | `{ consultationId, practitionerId, practitionerName, status, timestamp, message }` | Consultation activated event |
| `join_waiting_room_enhanced` | emit | `{ consultationId, userId }` | Join waiting room (enhanced) |
| `admit_from_waiting_room_enhanced` | emit | `{ consultationId, patientId, welcomeMessage? }` | Admit from waiting room (enhanced) |
| `join_live_consultation_enhanced` | emit | `{ consultationId, userId, role }` | Join live consultation (enhanced) |
| `get_practitioner_waiting_room` | emit | `{ practitionerId }` | Get practitioner waiting room |
| `waiting_room_heartbeat` | emit | `{ waitingRoomSessionId, patientId }` | Waiting room heartbeat |
| `media_permission_error_enhanced` | emit | `{ consultationId, userId, errorType, errorDetails }` | Enhanced media permission error |
| `create_system_notification_enhanced` | emit | `{ consultationId, notificationType, message, priority, createdBy }` | Create system notification (enhanced) |
| `error` | receive | `{ message, timestamp? }` | Generic error event | | `{ routerId, rtpCapabilities, canJoinMedia, mediaInitialized }` | Media session ready |
| `media_session_live` | receive | `{ consultationId, timestamp, mediasoupReady }` | Media session live |
| `client_error` | emit | `{ consultationId, userId, errorMessage }` | Client media error |
| `client_reconnect` | emit | `{ consultationId, userId }` | Client media reconnect |
| `media_session_initialized` | receive | `{ consultationId, routerId, rtpCapabilities, sessionInitialized }` | Media session initialized |
| `media_session_closed` | receive | `{ consultationId, mediasoupCleaned }` | Media session closed |
| `media_permission_status` | emit | `{ consultationId, userId, camera, microphone }` | Media permission status |
| `media_permission_status_update` | receive | `{ userId, role, camera, microphone, timestamp }` | Media permission status update |
| `media_permission_denied` | emit | `{ consultationId, userId, camera, microphone }` | Media permission denied |
| `media_permission_denied_notification` | receive | `{ userId, role, camera, microphone, timestamp, message }` | Media permission denied notification |
| `collect_stats` | emit | `{ consultationId, stats: { type, id, stats } }` | Collect media stats |
| `connection_quality_update` | receive | `{ type, id, stats, userId, timestamp }` | Media connection quality update |
| `invite_participant_email` | emit | `{ consultationId, inviteEmail, role }` | Invite participant via email |
| `join_via_invite` | emit | `{ token, userId? }` | Join via media invitation |
| `participant_invited` | receive | `{ consultationId, inviteEmail, role, invitationId, expiresAt }` | Participant invited |
| `participant_joined` | receive | `{ consultationId, userId, role, joinedAt }` | Participant joined |
| `connect` | receive | `-` | WebSocket connected |
| `disconnect` | receive | `-` | WebSocket disconnected |
| `reconnect` | receive | `-` | WebSocket reconnected |
| `connect_error` | receive | `{ error }` | Connection error |
| `mediaAction` | emit | `{ action, data }` | Media action (legacy) |hanced Consultation](#enhanced-consultation)

---


## Error Handling & Edge Cases

- All error events emit clear payloads (e.g., `message_error`, `read_receipt_error`).
- Frontend listens for error events and displays notifications.
- Connection state managed via RxJS `BehaviorSubject`.
- On disconnect, notification shown and reconnection attempted.
- File upload errors and progress surfaced to UI.

### Edge Cases

- Invalid consultation/user IDs
- Message send/read failures and bulk operations
- File upload errors with enhanced progress tracking
- Connection loss and automatic reconnection with quality monitoring
- Typing indicator timeouts and enhanced state management
- Large file uploads with size validation and progress updates
- Multi-user typing/read receipt handling
- Media permission denied/blocked scenarios with guidance
- Practitioner self-assignment race conditions
- Waiting room session recovery and heartbeat monitoring
- Cross-namespace event coordination
- Enhanced error reporting with detailed context

---

## Onboarding Steps

1. **Backend:**
   - Implement all event handlers across multiple gateways (`/consultation`, `/chat`, `/mediasoup`, `/enhanced-consultation`).
   - Use clear event names and comprehensive payloads with proper typing.
   - Emit detailed error events for all failures with context.
   - Implement proper namespace separation for different event types.
   - Add connection quality monitoring and media permission guidance.
2. **Frontend (Patient/Practitioner):**
   - Use dedicated WebSocket services for each namespace.
   - Subscribe to all relevant events with proper error handling.
   - Handle errors, reconnection, and cross-namespace coordination.
   - Validate payloads before emitting and implement retry mechanisms.
   - Implement enhanced notification systems with action handling.
3. **Testing:**
   - Simulate multi-user scenarios across different namespaces.
   - Test disconnects, media permission scenarios, and edge cases.
   - Validate event contract adherence and namespace isolation.
   - Test practitioner self-assignment race conditions.
   - Verify waiting room session recovery and heartbeat mechanisms.
4. **Documentation:**
   - Maintain shared event contract table with namespace documentation.
   - Update onboarding docs with enhanced event flows and error patterns.
   - Document cross-namespace event coordination patterns.
   - Include media permission guidance and connection quality handling.

---

**This document should be updated as new events or features are added.**
