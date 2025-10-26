from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("users", views.UserViewSet, basename="user")

app_name = "app"

urlpatterns = [
    path("", include(router.urls)),
    # Auth & session
    path("signup/", views.SignupView.as_view(), name="signup"),
    path("login/", views.LoginView.as_view(), name="login"),
    path("logout/", views.logout_view, name="logout"),
    path("me/", views.MeView.as_view(), name="me"),
    path("food-inspections/", views.FoodInspectionView.as_view(), name="food-inspections"),
    path("food-inspections/<int:pk>/", views.FoodInspectionDetailView.as_view(), name="food-inspections-detail"),
    # Families / recipients
    path("families/dashboard/", views.FamiliesDashboardView.as_view(), name="families-dashboard"),
    path("families/available/", views.FamiliesAvailableView.as_view(), name="families-available"),
    path("families/reserve/", views.FamiliesReserveView.as_view(), name="families-reserve"),
    path("families/claims/", views.FamiliesClaimsView.as_view(), name="families-claims"),
    path("families/aid/", views.FamiliesAidView.as_view(), name="families-aid"),
    path("families/profile/", views.FamiliesProfileView.as_view(), name="families-profile"),
    # Donor endpoints
    path("donors/profile/", views.DonorProfileView.as_view(), name="donors-profile"),
    path("donors/team/", views.DonorTeamCollectionView.as_view(), name="donors-team"),
    path("donors/team/<int:pk>/", views.DonorTeamMemberDetailView.as_view(), name="donors-team-detail"),
    path("donors/dashboard/", views.DonorDashboardView.as_view(), name="donors-dashboard"),
    path("donors/donations/", views.DonorDonationsView.as_view(), name="donors-donations"),
    path(
        "donors/donations/<int:pk>/",
        views.DonorDonationDetailView.as_view(),
        name="donors-donation-detail",
    ),
    path(
        "donors/donations/<int:pk>/claims/",
        views.DonorDonationClaimsView.as_view(),
        name="donors-donation-claims",
    ),
    path("donors/claims/<int:pk>/", views.DonorClaimStatusUpdateView.as_view(), name="donors-claim"),
    path("donors/analytics/", views.DonorAnalyticsView.as_view(), name="donors-analytics"),
    path("donors/impact/", views.DonorImpactView.as_view(), name="donors-impact"),
    path("donors/auto-route/", views.DonorAutoRouteView.as_view(), name="donors-auto-route"),
    # Volunteer endpoints
    path("volunteers/routes/", views.VolunteerRoutesView.as_view(), name="volunteers-routes"),
    path("volunteers/tasks/", views.VolunteerAvailableTasksView.as_view(), name="volunteers-tasks"),
    path("volunteers/tasks/accept/", views.VolunteerAcceptTaskView.as_view(), name="volunteers-task-accept"),
    path("volunteers/tasks/status/", views.VolunteerTaskStatusView.as_view(), name="volunteers-task-status"),
    path("volunteers/active/", views.VolunteerActiveDeliveriesView.as_view(), name="volunteers-active"),
    path("volunteers/impact/", views.VolunteerImpactView.as_view(), name="volunteers-impact"),
    path("volunteers/profile/", views.VolunteerProfileView.as_view(), name="volunteers-profile"),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    media_url = getattr(settings, "MEDIA_URL", None)
    media_root = getattr(settings, "MEDIA_ROOT", None)
    if media_url and media_root:
        urlpatterns += static(media_url, document_root=media_root)