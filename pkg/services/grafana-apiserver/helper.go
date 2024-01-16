package grafanaapiserver

import (
	"fmt"
	"net/http"
	goruntime "runtime"
	"strings"
	"time"

	"k8s.io/apimachinery/pkg/version"
	openapinamer "k8s.io/apiserver/pkg/endpoints/openapi"
	"k8s.io/apiserver/pkg/registry/generic"
	genericapiserver "k8s.io/apiserver/pkg/server"
	"k8s.io/apiserver/pkg/util/openapi"
	"k8s.io/client-go/kubernetes/scheme"

	"github.com/grafana/grafana/pkg/services/grafana-apiserver/builder"
	grafanaopenapi "github.com/grafana/grafana/pkg/services/grafana-apiserver/openapi"
	"github.com/grafana/grafana/pkg/setting"
)

func SetupConfig(serverConfig *genericapiserver.RecommendedConfig, builders []builder.APIGroupBuilder) error {
	defsGetter := grafanaopenapi.GetOpenAPIDefinitions(builders)
	serverConfig.OpenAPIConfig = genericapiserver.DefaultOpenAPIConfig(
		openapi.GetOpenAPIDefinitionsWithoutDisabledFeatures(defsGetter),
		openapinamer.NewDefinitionNamer(Scheme, scheme.Scheme))

	serverConfig.OpenAPIV3Config = genericapiserver.DefaultOpenAPIV3Config(
		openapi.GetOpenAPIDefinitionsWithoutDisabledFeatures(defsGetter),
		openapinamer.NewDefinitionNamer(Scheme, scheme.Scheme))

	// Add the custom routes to service discovery
	serverConfig.OpenAPIV3Config.PostProcessSpec = getOpenAPIPostProcessor(builders)

	// Set the swagger build versions
	serverConfig.OpenAPIConfig.Info.Version = setting.BuildVersion
	serverConfig.OpenAPIV3Config.Info.Version = setting.BuildVersion

	serverConfig.SkipOpenAPIInstallation = false
	serverConfig.BuildHandlerChainFunc = func(delegateHandler http.Handler, c *genericapiserver.Config) http.Handler {
		// Call DefaultBuildHandlerChain on the main entrypoint http.Handler
		// See https://github.com/kubernetes/apiserver/blob/v0.28.0/pkg/server/config.go#L906
		// DefaultBuildHandlerChain provides many things, notably CORS, HSTS, cache-control, authz and latency tracking
		requestHandler, err := getAPIHandler(
			delegateHandler,
			c.LoopbackClientConfig,
			builders)
		if err != nil {
			panic(fmt.Sprintf("could not build handler chain func: %s", err.Error()))
		}
		return genericapiserver.DefaultBuildHandlerChain(requestHandler, c)
	}

	k8sVersion, err := getK8sApiserverVersion()
	if err != nil {
		return err
	}
	before, after, _ := strings.Cut(setting.BuildVersion, ".")
	serverConfig.Version = &version.Info{
		Major:        before,
		Minor:        after,
		GoVersion:    goruntime.Version(),
		Platform:     fmt.Sprintf("%s/%s", goruntime.GOOS, goruntime.GOARCH),
		Compiler:     goruntime.Compiler,
		GitTreeState: setting.BuildBranch,
		GitCommit:    setting.BuildCommit,
		BuildDate:    time.Unix(setting.BuildStamp, 0).UTC().Format(time.DateTime),
		GitVersion:   k8sVersion,
	}
	return nil
}

func InstallAPIs(server *genericapiserver.GenericAPIServer,
	optsGetter generic.RESTOptionsGetter,
	builders []builder.APIGroupBuilder,
) error {
	for _, b := range builders {
		g, err := b.GetAPIGroupInfo(Scheme, Codecs, optsGetter)
		if err != nil {
			return err
		}
		if g == nil || len(g.PrioritizedVersions) < 1 {
			continue
		}
		err = server.InstallAPIGroup(g)
		if err != nil {
			return err
		}
	}
	return nil
}
