import { execSync } from 'child_process';

export interface AwsCliMetadata {
  isLoggedIn: boolean;
  region: string | null;
  /** Masked account ID suffix — safe to send to LLM */
  accountIdSuffix: string | null;
  /** Full account ID kept local only, never sent to LLM */
  accountIdFull: string | null;
  callerArn: string | null;
  defaultVpcId: string | null;
  availabilityZones: string[];
  eksClusterNames: string[];
  ecsClusterArns: string[];
}

function run(cmd: string): string | null {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 8000,
    }).trim();
  } catch {
    return null;
  }
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function inspectAwsCli(
  target: 'aws_ec2' | 'aws_ecs' | 'aws_eks',
): Promise<AwsCliMetadata> {
  const identity = parseJson<{ Account: string; Arn: string }>(run('aws sts get-caller-identity'));

  if (!identity) {
    return {
      isLoggedIn: false,
      region: null,
      accountIdSuffix: null,
      accountIdFull: null,
      callerArn: null,
      defaultVpcId: null,
      availabilityZones: [],
      eksClusterNames: [],
      ecsClusterArns: [],
    };
  }

  const accountIdFull = identity.Account ?? null;
  const accountIdSuffix = accountIdFull ? `****${accountIdFull.slice(-4)}` : null;
  // Mask account ID in ARN before it could ever reach LLM context
  const callerArn = identity.Arn ? identity.Arn.replace(/\d{12}/, '************') : null;

  const region =
    run('aws configure get region') ??
    run(
      'aws ec2 describe-availability-zones --query "AvailabilityZones[0].RegionName" --output text',
    );

  const vpcRaw = parseJson<{ Vpcs: Array<{ VpcId: string }> }>(
    run('aws ec2 describe-vpcs --filters Name=isDefault,Values=true --output json'),
  );
  const defaultVpcId = vpcRaw?.Vpcs?.[0]?.VpcId ?? null;

  const azRaw = parseJson<{ AvailabilityZones: Array<{ ZoneName: string }> }>(
    run('aws ec2 describe-availability-zones --output json'),
  );
  const availabilityZones = azRaw?.AvailabilityZones?.map((az) => az.ZoneName) ?? [];

  let eksClusterNames: string[] = [];
  if (target === 'aws_eks') {
    const eksRaw = parseJson<{ clusters: string[] }>(run('aws eks list-clusters --output json'));
    eksClusterNames = eksRaw?.clusters ?? [];
  }

  let ecsClusterArns: string[] = [];
  if (target === 'aws_ecs') {
    const ecsRaw = parseJson<{ clusterArns: string[] }>(run('aws ecs list-clusters --output json'));
    // Mask account IDs in ARNs
    ecsClusterArns = (ecsRaw?.clusterArns ?? []).map((arn) =>
      arn.replace(/\d{12}/, '************'),
    );
  }

  return {
    isLoggedIn: true,
    region,
    accountIdSuffix,
    accountIdFull,
    callerArn,
    defaultVpcId,
    availabilityZones,
    eksClusterNames,
    ecsClusterArns,
  };
}

/** Only the fields safe to include in LLM prompts — no account IDs, no keys */
export function safeMetadataForLlm(meta: AwsCliMetadata): Record<string, unknown> {
  return {
    region: meta.region ?? 'unknown',
    accountIdSuffix: meta.accountIdSuffix ?? 'unknown',
    callerArn: meta.callerArn ?? 'unknown',
    defaultVpcId: meta.defaultVpcId ?? 'none detected',
    availabilityZones: meta.availabilityZones,
    eksClusterNames: meta.eksClusterNames,
    ecsClusterArns: meta.ecsClusterArns,
  };
}
