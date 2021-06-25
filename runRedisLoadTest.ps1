function RunLoadTest {

    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $false)]
        [int]$NumOfPods = 100,
		[Parameter(Mandatory = $false)]
        [string]$Namespace = 'redis-load-test-a1'
    )

	# kubectl config set-context --current --namespace=$Namespace | out-null
	CreateInfra -NumOfPods $NumOfPods -Namespace $Namespace
}

function CreateInfra{

	[CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]
        [int]$NumOfPods,
		[Parameter(Mandatory = $true)]
        [string]$Namespace
    )

	kubectl create namespace $Namespace
	kubectl apply -f redis-load-app.yaml -n $Namespace
    kubectl scale deployments redis-app -n $Namespace --replicas=$NumOfPods
    $RunningNumOfPods = $(kubectl get pods -n $Namespace --field-selector status.phase=Running).count - 1
    while ($NumOfPods -ne $RunningNumOfPods) {
        Write-Host "Pods are in-progress"
        Start-Sleep -s 5
        $RunningNumOfPods = $(kubectl get pods -n $Namespace  --field-selector status.phase=Running).count - 1
    }
    Write-Host "Pods are created and running"
}