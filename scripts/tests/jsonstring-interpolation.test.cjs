// Focused source-level regression suite; run with Node and the repository's TypeScript dependency.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const feature = 'public/app/features/templating/';
const schema = {
  VariableFormatID: { Glob: 'glob', Text: 'text', PercentEncode: 'percentencode', QueryParam: 'queryparam' },
};
// Legacy format registry is a framework boundary. Production jsonstring code is loaded below unchanged.
const formatRegistry = {
  getIfExists: (format) =>
    ['glob', 'json'].includes(format)
      ? {
          formatter: (value) => (Array.isArray(value) ? JSON.stringify(value) : String(value)),
        }
      : undefined,
  get: () => ({ formatter: String }),
};
function load(file, imports) {
  const source = fs.readFileSync(path.isAbsolute(file) ? file : path.join(root, file), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  vm.runInNewContext(
    compiled.outputText,
    {
      module,
      exports: module.exports,
      window: global.window,
      console: { ...console, error: () => {} },
      require: (name) => {
        if (Object.hasOwn(imports, name)) return imports[name];
        throw new Error(`Unexpected framework import: ${name}`);
      },
    },
    { filename: file }
  );
  return module.exports;
}
global.window = {};
// Use the real Scenes 6.42 MultiValueVariable protocol, including CustomAllValue wrappers.
const sceneFile = path.join(
  path.dirname(require.resolve('@grafana/scenes')),
  'esm/variables/variants/MultiValueVariable.js'
);
const { MultiValueVariable } = load(sceneFile, {
  lodash: require('lodash'),
  rxjs: {},
  '../constants.js': { ALL_VARIABLE_VALUE: '$__all', ALL_VARIABLE_TEXT: 'All' },
  '../../core/SceneObjectBase.js': {
    SceneObjectBase: class {
      constructor(state) {
        this.state = state;
      }
    },
  },
  '../types.js': {},
  '../interpolation/formatRegistry.js': { formatRegistry },
  '@grafana/schema': schema,
  '../../utils/utils.js': {},
  '../../performance/interactionConstants.js': {},
  '../../core/sceneGraph/getQueryController.js': {},
});
const { TextBoxVariable } = load(path.join(path.dirname(sceneFile), 'TextBoxVariable.js'), {
  react: {},
  '../../core/SceneObjectBase.js': {
    SceneObjectBase: class {
      constructor(state) {
        this.state = state;
      }
      setState(update) {
        Object.assign(this.state, update);
      }
      publishEvent() {}
    },
  },
  '../../services/SceneObjectUrlSyncConfig.js': { SceneObjectUrlSyncConfig: class {} },
  '../components/VariableValueInput.js': {},
  '../types.js': { SceneVariableValueChangedEvent: class {} },
});
const formatter = load(feature + 'formatVariableValue.ts', {
  '@grafana/scenes': { formatRegistry },
  '@grafana/schema': schema,
  '../variables/guard': { isAdHoc: () => false },
  './LegacyVariableWrapper': { getVariableWrapper: () => ({}) },
});
const lookupVariable = (name, scene) => scene.variables[name];
const { sceneInterpolator } = load(path.join(path.dirname(sceneFile), '../interpolation/sceneInterpolator.js'), {
  '@grafana/schema': schema,
  '../types.js': {
    isCustomVariableValue: (value) => typeof value === 'object' && value !== null && 'formatter' in value,
  },
  './ScopedVarsVariable.js': {
    getSceneVariableForScopedVar: (name, scoped) => ({ state: { name }, getValue: () => scoped.value }),
  },
  './formatRegistry.js': { formatRegistry },
  '../constants.js': { VARIABLE_REGEX: /\$(\w+)|\[\[(\w+?)(?::(\w+))?\]\]|\${(\w+)(?:\.([^:^\}]+))?(?::([^\}]+))?}/g },
  '../lookupVariable.js': { lookupVariable },
  '../macros/index.js': { macrosIndex: new Map() },
});
const sceneGraph = { lookupVariable, interpolate: sceneInterpolator };
const { TemplateSrv } = load(feature + 'template_srv.ts', {
  lodash: { escape: String, isString: (value) => typeof value === 'string' },
  '@grafana/data': { deprecationWarning: () => {} },
  '@grafana/runtime': { setTemplateSrv: () => {} },
  '@grafana/scenes': { sceneGraph, MultiValueVariable },
  '@grafana/schema': schema,
  '../dashboard-scene/utils/getVariablesCompatibility': {},
  '../variables/adapters': {},
  '../variables/guard': { isAdHoc: () => false },
  '../variables/constants': { ALL_VARIABLE_TEXT: 'All', ALL_VARIABLE_VALUE: '$__all' },
  '../variables/state/selectors': { getVariables: () => [] },
  '../variables/utils': {
    variableRegex: /\$(\w+)|\[\[(\w+?)(?::(\w+))?\]\]|\${(\w+)(?:\.([^:^\}]+))?(?::([^\}]+))?}/g,
  },
  './fieldAccessorCache': { getFieldAccessor: (field) => (value) => value[field] },
  './formatVariableValue': formatter,
  './macroRegistry': { macroRegistry: {} },
});
const create = (variables = []) => {
  const service = new TemplateSrv({
    getVariables: () => variables,
    getVariableWithName: (name) => variables.find((v) => v.name === name),
  });
  service.init(variables);
  return service;
};
const variable = (name, value, extra = {}) => ({ name, current: { value }, ...extra });

test('jsonstring serializes scalars, numeric IDs, nulls, arrays and escaped labels', () => {
  for (const value of [
    'default-datasource',
    1646104845,
    '.*',
    'a"\\\n$job',
    null,
    undefined,
    [],
    ['IAM_OceanBase', 42],
  ]) {
    const expected = Array.isArray(value) ? value.map(String) : String(value ?? '');
    assert.deepEqual(JSON.parse(formatter.formatVariableValue(value, 'jsonstring')), expected);
  }
});
test('legacy custom All and multi-select produce valid string filters', () => {
  const service = create([variable('job', '$__all', { allValue: '.*' }), variable('tenant', ['a"b', 'tnt_iam'])]);
  assert.deepEqual(JSON.parse(service.replace('{"job":${job:jsonstring},"tenant":${tenant:jsonstring}}')), {
    job: '.*',
    tenant: ['a"b', 'tnt_iam'],
  });
});
test('legacy custom All keeps its existing raw PromQL behavior', () => {
  assert.equal(create([variable('job', '$__all', { allValue: '.*' })]).replace('${job:regex}'), '.*');
});
test('scoped values override dashboard values and dollar labels are never interpolated twice', () => {
  const service = create([variable('tenant', 'default'), variable('job', 'wrong')]);
  assert.equal(JSON.parse(service.replace('${tenant:jsonstring}', { tenant: { value: 'a"$job\\b' } })), 'a"$job\\b');
});
for (const mode of ['scoped', 'active']) {
  test(`scene ${mode} scope serializes custom All and numeric/multi selections`, () => {
    const scene = {
      isActive: true,
      variables: {
        job: new MultiValueVariable({ value: '$__all', allValue: '.*' }),
        cluster: { state: {}, getValue: () => 1646104845 },
        tenant: { state: {}, getValue: () => ['a"\\$job', 'tnt_iam'] },
      },
    };
    const service = create();
    const scoped = mode === 'scoped' ? { __sceneObject: { value: { valueOf: () => scene } } } : undefined;
    if (mode === 'active') global.window.__grafanaSceneContext = scene;
    try {
      assert.deepEqual(
        JSON.parse(
          service.replace(
            '{"job":${job:jsonstring},"cluster":${cluster:jsonstring},"tenant":${tenant:jsonstring}}',
            scoped
          )
        ),
        {
          job: '.*',
          cluster: '1646104845',
          tenant: ['a"\\$job', 'tnt_iam'],
        }
      );
    } finally {
      delete global.window.__grafanaSceneContext;
    }
  });
}
test('scene All without a custom value expands available selections', () => {
  const scene = {
    variables: { tenant: new MultiValueVariable({ value: '$__all', options: [{ value: 'a' }, { value: 'b' }] }) },
  };
  assert.deepEqual(JSON.parse(create().replace('${tenant:jsonstring}', { __sceneObject: { value: scene } })), [
    'a',
    'b',
  ]);
});

test('actual scene textbox keeps exporter identity from URL through interpolation', () => {
  const exporter = new TextBoxVariable({ name: 'think_exporter_instance_id', value: '.*' });
  assert.deepEqual(Array.from(exporter.getKeys()), ['var-think_exporter_instance_id']);
  exporter.updateFromUrl({ 'var-think_exporter_instance_id': 'exporter-a' });
  const scene = { variables: { think_exporter_instance_id: exporter } };
  assert.equal(
    JSON.parse(create().replace('${think_exporter_instance_id:jsonstring}', { __sceneObject: { value: scene } })),
    'exporter-a'
  );
});

test('customer-shaped requests parse with all IDs scoped and millisecond times intact', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/ob-tenant-trend.json'), 'utf8'));
  const targets = process.env.OB_DASHBOARD_PATH
    ? JSON.parse(fs.readFileSync(process.env.OB_DASHBOARD_PATH, 'utf8'))
        .panels.filter((p) => [23, 24, 25].includes(p.id))
        .map((p) => p.targets[0])
    : [fixture];
  const variables = Object.entries(fixture.values).map(([name, value]) =>
    variable(name, value, value === '$__all' ? { allValue: '.*' } : {})
  );
  const scene = {
    variables: Object.fromEntries(
      Object.entries(fixture.values).map(([name, value]) => [
        name,
        value === '$__all'
          ? new MultiValueVariable({ name, value, allValue: '.*' })
          : { state: { name }, getValue: () => value },
      ])
    ),
  };
  for (const target of targets) {
    for (const scoped of [undefined, { __sceneObject: { value: scene } }]) {
      const request = JSON.parse(create(variables).replace(target.body, scoped));
      assert.equal(request.executionId, 402);
      assert.equal(request.startMillis, 1792129370000);
      assert.equal(request.endMillis, 1792129724000);
      assert.deepEqual(request.filter, {
        datasourceId: 'default-datasource',
        job: '.*',
        instance: '.*',
        metrics_profile: 'oceanbase-ocp-basic-v1',
        service_name: ['example-service'],
        ob_cluster_id: '1646104845',
        svr_ip: '.*',
        think_exporter_instance_id: 'exporter-a',
        tenant_name: 'tenant-a',
      });
    }
  }
});
