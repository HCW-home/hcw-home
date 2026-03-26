import time
import asyncio
from typing import Optional

from django.conf import settings
from livekit import api
from livekit.api import (
    AccessToken,
    ListRoomsRequest,
    LiveKitAPI,
    SendDataRequest,
    TwirpError,
    VideoGrants,
    S3Upload,
    EncodedFileOutput,
    StopEgressRequest,
    RoomCompositeEgressRequest,
)

from django.db import connection

from . import BaseMediaserver


class Main(BaseMediaserver):
    name = "livekit"
    display_name = "LiveKit"

    def __init__(self, server):
        super().__init__(server)
        self._client: Optional[LiveKitAPI] = None

    @property
    def client(self):
        """Lazy initialization of client within async context"""
        if self._client is None:
            self._client = LiveKitAPI(
                self.server.url, self.server.api_token, self.server.api_secret
            )
        return self._client

    async def _test_connection_async(self):
        """Async implementation of test_connection"""
        async with LiveKitAPI(
            url=self.server.url,
            api_key=self.server.api_token,
            api_secret=self.server.api_secret,
        ) as client:
            req = ListRoomsRequest()
            return await client.room.list_rooms(req)

    def test_connection(self):
        """Synchronous wrapper for test_connection"""
        return asyncio.run(self._test_connection_async())

    async def _get_create_room(self, room_name: str):
        async with LiveKitAPI(
            url=self.server.url,
            api_key=self.server.api_token,
            api_secret=self.server.api_secret,
        ) as client:
            return await client.room.create_room(
                api.CreateRoomRequest(
                    name=room_name,
                    empty_timeout=10 * 60,  # 10 minutes avant suppression si vide
                    max_participants=10,
                )
            )

    def _get_tenant_prefix(self):
        return connection.tenant.schema_name

    def appointment_participant_info(self, appointment, user):
        room_name = f"{self._get_tenant_prefix()}_appointment_{appointment.pk}"

        video_grants = VideoGrants(
            room=room_name,
            room_join=True,
            # room_admin=is_admin_or_owner,
            # can_update_own_metadata=True,
            can_publish=True,
            # can_publish_sources=sources,
            can_subscribe=True,
        )

        return (
            AccessToken(
                api_key=self.server.api_token,
                api_secret=self.server.api_secret,
            )
            .with_grants(video_grants)
            .with_identity(str(user.pk))
            .with_name(user.name)
            .to_jwt()
        )

    def user_test_info(self, user):
        room_name = f"{self._get_tenant_prefix()}_usertest_{user.pk}"

        video_grants = VideoGrants(
            room=room_name,
            room_join=True,
            # room_admin=is_admin_or_owner,
            # can_update_own_metadata=True,
            can_publish=True,
            # can_publish_sources=sources,
            can_subscribe=True,
        )

        return (
            AccessToken(
                api_key=self.server.api_token,
                api_secret=self.server.api_secret,
            )
            .with_grants(video_grants)
            .with_identity(str(user.pk))
            .with_name(user.name)
            .to_jwt()
        )

    def consultation_user_info(self, consultation, user):
        room_name = f"{self._get_tenant_prefix()}_consultation_{consultation.pk}"

        video_grants = VideoGrants(
            room=room_name,
            room_join=True,
            # room_admin=is_admin_or_owner,
            # can_update_own_metadata=True,
            can_publish=True,
            # can_publish_sources=sources,
            can_subscribe=True,
        )

        return (
            AccessToken(
                api_key=self.server.api_token,
                api_secret=self.server.api_secret,
            )
            .with_grants(video_grants)
            .with_identity(str(user.pk))
            .with_name(user.name)
            .to_jwt()
        )

    async def get_room_info(self, room_name: str):
        """Get information about a specific room"""
        async with LiveKitAPI(
            url=self.server.url,
            api_key=self.server.api_token,
            api_secret=self.server.api_secret,
        ) as client:
            # List all rooms and find the specific one
            list_request = ListRoomsRequest(names=[room_name])
            rooms_response = await client.room.list_rooms(list_request)

            if rooms_response.rooms:
                return rooms_response.rooms[0]
            return None

    async def start_room_recording(self, room_name: str, appointment_id: int) -> str:
        """Start recording a room using room composite egress"""
        async with LiveKitAPI(
            url=self.server.url,
            api_key=self.server.api_token,
            api_secret=self.server.api_secret,
        ) as client:
            # Check if the room exists and has participants
            room_info = await self.get_room_info(room_name)

            if not room_info:
                raise ValueError(f"Room '{room_name}' does not exist. Make sure participants have joined the video call before starting recording.")

            if room_info.num_participants == 0:
                raise ValueError(f"Room '{room_name}' has no participants. At least one participant must be in the call before starting recording.")

            # S3 configuration from settings (LiveKit-specific)
            s3_upload = S3Upload(
                access_key=settings.LIVEKIT_S3_ACCESS_KEY,
                secret=settings.LIVEKIT_S3_SECRET_KEY,
                bucket=settings.LIVEKIT_S3_BUCKET_NAME,
                region=settings.LIVEKIT_S3_REGION,
                endpoint=settings.LIVEKIT_S3_ENDPOINT_URL,
                force_path_style=True,  # Required for MinIO/S3-compatible services
            )

            # File output configuration
            filepath = f"recordings/appointment_{appointment_id}_{int(time.time())}.mp4"
            file_output = EncodedFileOutput(
                filepath=filepath,
                s3=s3_upload,
            )

            # Room composite request
            request = RoomCompositeEgressRequest(
                room_name=room_name,
                file_outputs=[file_output],
            )

            egress_info = await client.egress.start_room_composite_egress(request)
            return egress_info.egress_id, filepath

    async def stop_room_recording(self, egress_id: str) -> None:
        """Stop an ongoing recording"""
        async with LiveKitAPI(
            url=self.server.url,
            api_key=self.server.api_token,
            api_secret=self.server.api_secret,
        ) as client:
            request = StopEgressRequest(egress_id=egress_id)
            await client.egress.stop_egress(request)
