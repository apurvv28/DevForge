import { inspectAwsCli, safeMetadataForLlm } from '../../../src/agent/aws/awsCliInspector';
import { execSync } from 'child_process';

jest.mock('child_process');

describe('awsCliInspector', () => {
  let mockExecSync: jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();
    mockExecSync = execSync as unknown as jest.Mock;
  });

  it('returns isLoggedIn false if STS call fails', async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('Not logged in');
    });

    const meta = await inspectAwsCli('aws_ecs');
    expect(meta.isLoggedIn).toBe(false);
    expect(meta.region).toBeNull();
  });

  it('returns mapped metadata when logged in for ECS', async () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('sts get-caller-identity')) {
        return JSON.stringify({ Account: '123456789012', Arn: 'arn:aws:iam::123456789012:user/Test' });
      }
      if (cmd.includes('configure get region')) {
        return 'us-west-2';
      }
      if (cmd.includes('describe-vpcs')) {
        return JSON.stringify({ Vpcs: [{ VpcId: 'vpc-abc123' }] });
      }
      if (cmd.includes('describe-availability-zones')) {
        return JSON.stringify({ AvailabilityZones: [{ ZoneName: 'us-west-2a' }, { ZoneName: 'us-west-2b' }] });
      }
      if (cmd.includes('ecs list-clusters')) {
        return JSON.stringify({ clusterArns: ['arn:aws:ecs:us-west-2:123456789012:cluster/my-cluster'] });
      }
      return '';
    });

    const meta = await inspectAwsCli('aws_ecs');
    expect(meta.isLoggedIn).toBe(true);
    expect(meta.region).toBe('us-west-2');
    expect(meta.accountIdSuffix).toBe('****9012');
    expect(meta.accountIdFull).toBe('123456789012');
    expect(meta.callerArn).toBe('arn:aws:iam::************:user/Test');
    expect(meta.defaultVpcId).toBe('vpc-abc123');
    expect(meta.availabilityZones).toEqual(['us-west-2a', 'us-west-2b']);
    expect(meta.ecsClusterArns).toEqual(['arn:aws:ecs:us-west-2:************:cluster/my-cluster']);
  });

  it('returns mapped metadata when logged in for EKS', async () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('sts get-caller-identity')) {
        return JSON.stringify({ Account: '123456789012', Arn: 'arn:aws:iam::123456789012:user/Test' });
      }
      if (cmd.includes('configure get region')) {
        return 'us-east-1';
      }
      if (cmd.includes('describe-vpcs')) {
        return JSON.stringify({});
      }
      if (cmd.includes('describe-availability-zones')) {
        return JSON.stringify({});
      }
      if (cmd.includes('eks list-clusters')) {
        return JSON.stringify({ clusters: ['my-eks-cluster'] });
      }
      return '';
    });

    const meta = await inspectAwsCli('aws_eks');
    expect(meta.isLoggedIn).toBe(true);
    expect(meta.region).toBe('us-east-1');
    expect(meta.eksClusterNames).toEqual(['my-eks-cluster']);
  });

  it('creates safe metadata for LLM', () => {
    const safe = safeMetadataForLlm({
      isLoggedIn: true,
      region: 'us-west-2',
      accountIdSuffix: '****9012',
      accountIdFull: '123456789012',
      callerArn: 'arn:aws:iam::************:user/Test',
      defaultVpcId: 'vpc-abc123',
      availabilityZones: ['us-west-2a'],
      eksClusterNames: ['cluster1'],
      ecsClusterArns: ['arn:aws:ecs:us-west-2:************:cluster/cluster2'],
    });

    expect(safe.region).toBe('us-west-2');
    expect(safe.accountIdSuffix).toBe('****9012');
    expect(safe.callerArn).toBe('arn:aws:iam::************:user/Test');
    expect(safe.defaultVpcId).toBe('vpc-abc123');
    // AccountIdFull should be stripped/not present
    expect((safe as any).accountIdFull).toBeUndefined();
  });
});
