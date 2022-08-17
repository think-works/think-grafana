package comments

import (
	"context"

	"github.com/grafana/grafana/pkg/services/accesscontrol"
	"github.com/grafana/grafana/pkg/services/comments/commentmodel"
	"github.com/grafana/grafana/pkg/services/dashboards"
	"github.com/grafana/grafana/pkg/services/featuremgmt"
	"github.com/grafana/grafana/pkg/services/live"
	"github.com/grafana/grafana/pkg/services/sqlstore"
	"github.com/grafana/grafana/pkg/services/user"
	"github.com/grafana/grafana/pkg/setting"
)

type Service struct {
	cfg         *setting.Cfg
	live        *live.GrafanaLive
	sqlStore    *sqlstore.SQLStore
	storage     Storage
	permissions *commentmodel.PermissionChecker
	userService user.Service
}

func ProvideService(cfg *setting.Cfg, store *sqlstore.SQLStore, live *live.GrafanaLive,
	features featuremgmt.FeatureToggles, accessControl accesscontrol.AccessControl,
	dashboardService dashboards.DashboardService, userService user.Service) *Service {
	s := &Service{
		cfg:      cfg,
		live:     live,
		sqlStore: store,
		storage: &sqlStorage{
			sql: store,
		},
		permissions: commentmodel.NewPermissionChecker(store, features, accessControl, dashboardService),
		userService: userService,
	}
	return s
}

// Run Service.
func (s *Service) Run(ctx context.Context) error {
	<-ctx.Done()
	return ctx.Err()
}
