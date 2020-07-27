import { FinalInstanceConfig } from '../types';
import { execSync } from 'child_process';
import { _ } from 'lodash';
import makeContainers from './dbcontainers';
import logger from '../logger';

const runContainer = function (config: FinalInstanceConfig): void {
  makeContainers(config);

  const {
    locale,
    instanceName,
    networkname,
    containerName,
    containerPort,
    dockerBridgeIP,
    alreadyInstalled,
    ftp,
    ssh,
  } = config;

  let volumes = config.volumes;
  let { downloadPlugins } = config;
  downloadPlugins = [...downloadPlugins, 'relative-url'];
  const dplugins = `--env PLUGINS="${downloadPlugins.join(' ')}"`;

  config.envvars['DOCKER_BRIDGE_IP'] = dockerBridgeIP.trim();
  config.envvars['DOCKER_CONTAINER_PORT'] = containerPort;
  const apacheEnvVars = config.envvars
    ? `--env APACHE_ENV_VARS=${JSON.stringify(JSON.stringify(config.envvars)).trim()}`
    : '';
  const envvars = Object.keys(config.envvars).map((key) => {
    return `--env ${key}=${config.envvars[key]}`;
  });
  const envs = envvars.join(' ');

  let ftpenv = '';
  if (ftp) {
    ftpenv = `--env FTP_CONFIGS=${JSON.stringify(JSON.stringify(ftp)).trim()}`;
  }

  let sshenv = '';
  if (ssh) {
    const sshCopy = _.cloneDeep(ssh);
    const keyPathVolumes = sshCopy.map(({ privateKeyPath, privateKeyFilename }, index: number) => {
      // remove since Windows paths break JSON
      delete ssh[index].privateKeyPath;
      return `-v ${privateKeyPath}:/app/ssh/${privateKeyFilename}`;
    });

    sshenv = `--env SSH_CONFIGS=${JSON.stringify(JSON.stringify(ssh)).trim()}`;
    volumes = [...volumes, ...keyPathVolumes];
  }

  if (process.platform === 'win32' && process.env.DOCKER_TOOLBOX_INSTALL_PATH) {
    volumes = volumes.map((vpath) => vpath.replace(/C:\\/gi, '/c/'));
    volumes = volumes.map((vpath) => vpath.replace(/\\/gi, '/'));
    volumes = volumes.map((vpath) => vpath.replace(/:\//gi, '://'));
  }
  const v = volumes.join(' ');

  try {
    execSync(
      `docker run -d --name=${containerName} -p ${containerPort}:80 \
        --cap-add=SYS_ADMIN \
        --device=/dev/fuse \
        --security-opt apparmor=unconfined \
        ${v} \
        ${dplugins} \
        ${envs} \
        ${sshenv} \
        ${ftpenv} \
        ${apacheEnvVars} \
        --env XDEBUG_CONFIG=remote_host="${dockerBridgeIP.trim()}" \
        --env DOCKER_BRIDGE_IP="${dockerBridgeIP.trim()}" \
        --env DOCKER_CONTAINER_PORT=${containerPort} \
        --env INSTANCE_NAME=${instanceName} \
        --env ALREADY_INSTALLED_PLUGINS=${JSON.stringify(JSON.stringify(alreadyInstalled)).trim()} \
        --env WP_LOCALE=${locale} \
        --env WP_DEBUG=1 \
        --env WP_DEBUG_DISPLAY=1 \
        --env DB_HOST=aivec_wp_mysql \
        --env DB_USER=root \
        --env DB_PASS=root \
        --env URL_REPLACE="http://localhost:${containerPort}" \
        --network=${networkname}_default \
        wordpress_devenv_visiblevc`,
      { stdio: 'inherit' },
    );
  } catch (e) {
    console.log(e);
    logger.error('Something went wrong :(');
    process.exit(1);
  }

  try {
    execSync(`docker logs -f ${containerName}`, { stdio: 'inherit' });
  } catch (e) {
    logger.info(
      `${logger.YELLOW}${containerName}${logger.WHITE} is still running in the background. You can view the log stream anytime with ${logger.GREEN}Log WordPress Container`,
    );
  }
};

export default runContainer;
