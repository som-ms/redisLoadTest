function RunLoadTest {

    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $false)]
        [int]$TotalNumOfChannels = 2,
        [Parameter(Mandatory = $false)]
        [int]$NumOfSubscribersPerChannel = 3,
        [Parameter(Mandatory = $false)]
        [int]$TotalRunTimePublisherInMinutes = 5,
		[Parameter(Mandatory = $false)]
        [string]$SubscriberNamespace = 'redis-load-test-sub',
        [Parameter(Mandatory = $false)]
        [string]$PublisherNamespace = 'redis-load-test-pub',
        [Parameter(Mandatory = $false)]
        [string]$TestUid = [guid]::NewGuid()
    )

    Write-Output "Running TestUid: $TestUid"

    CreateSubscriberInfra -TotalNumOfChannels $TotalNumOfChannels -NumOfSubscribersPerChannel $NumofSubscribersPerChannel -SubscriberNamespace $SubscriberNamespace
    CreatePublisherInfra -TotalNumOfChannels $TotalNumOfChannels -PublisherNamespace $PublisherNamespace
    RunSubscribers -TotalNumOfChannels $TotalNumOfChannels -NumofSubscribersPerChannel $NumofSubscribersPerChannel -SubscriberNamespace $SubscriberNamespace
    RunPublishers -TotalNumOfChannels $TotalNumOfChannels -TotalRunTimePublisherInMinutes $TotalRunTimePublisherInMinutes -PublisherNamespace $PublisherNamespace
}

function CreateSubscriberInfra{

	[CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]
        [int]$TotalNumOfChannels,
        [Parameter(Mandatory = $true)]
        [int]$NumofSubscribersPerChannel,
		[Parameter(Mandatory = $true)]
        [string]$SubscriberNamespace
    )

    $TotalSubscriberPods = $TotalNumOfChannels * $NumofSubscribersPerChannel
    Write-Host "Total subscriber pods required: $TotalSubscriberPods"
	kubectl create namespace $SubscriberNamespace
	kubectl apply -f redis-load-app.yaml -n $SubscriberNamespace
    kubectl scale deployments redis-app -n $SubscriberNamespace --replicas=$TotalSubscriberPods
    $RunningNumOfPods = $(kubectl get pods -n $SubscriberNamespace --field-selector status.phase=Running).count - 1
    while ($TotalSubscriberPods -ne $RunningNumOfPods) {
        Write-Host "Subscribers Pods are in-progress"
        Start-Sleep -s 10
        $RunningNumOfPods = $(kubectl get pods -n $SubscriberNamespace  --field-selector status.phase=Running).count - 1
    }

    Write-Host "Subscriber Pods are created and running"
}

function CreatePublisherInfra{

	[CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]
        [int]$TotalNumOfChannels,
		[Parameter(Mandatory = $true)]
        [string]$PublisherNamespace
    )

    Write-Host "Total publisher pods required: $TotalNumOfChannels"
	kubectl create namespace $PublisherNamespace
	kubectl apply -f redis-load-app.yaml -n $PublisherNamespace
    kubectl scale deployments redis-app -n $PublisherNamespace --replicas=$TotalNumOfChannels
    $RunningNumOfPods = $(kubectl get pods -n $PublisherNamespace --field-selector status.phase=Running).count - 1
    while ($TotalNumOfChannels -ne $RunningNumOfPods) {
        Write-Host "Pods are in-progress"
        Start-Sleep -s 10
        $RunningNumOfPods = $(kubectl get pods -n $PublisherNamespace  --field-selector status.phase=Running).count - 1
    }
    Write-Host "Publisher Pods are created and running"
}

function RunSubscribers{
    	[CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]
        [int]$TotalNumOfChannels,
        [Parameter(Mandatory = $true)]
        [int]$NumofSubscribersPerChannel,
        [Parameter(Mandatory = $true)]
        [string]$SubscriberNamespace
    )

    $TotalSubscriberCount = $TotalNumOfChannels * $NumofSubscribersPerChannel;

	$Pods = $(kubectl get pods -n $SubscriberNamespace --field-selector status.phase=Running -o json | ConvertFrom-Json).items
    [int]$PodsCount = $Pods.count

    if ( $PodsCount -ne $TotalSubscriberCount ) {
        Write-Error "Number of pods not equal to number of docs"
        return
     }

    $channel = 0; $i=0;
    while($channel -ne $TotalNumOfChannels){
        $subscriber = 0;
        while($subscriber -ne $NumofSubscribersPerChannel){
            $SleepTime = Get-Random -Minimum 0 -Maximum 3
            sleep $SleepTime
            $PodName = $Pods[$i].metadata.name
            $Command = "node ./server/subscriber.js $channel $subscriber"

            Write-Output "Exec Command: $Command on Pod: $PodName"
            kubectl exec $PodName -n $SubscriberNamespace -- bash -c $Command
            Write-Output "Exec Command DONE: on Pod: $PodName"

            Write-Output "Completed $i"
            $subscriber++;
        }
        $channel++;
    }
}

function RunPublishers{
        [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]
        [int]$TotalNumOfChannels,
        [Parameter(Mandatory = $true)]
        [int]$TotalRunTimePublisherInMinutes,
        [Parameter(Mandatory = $true)]
        [string]$PublisherNamespace
    )

	$Pods = $(kubectl get pods -n $PublisherNamespace --field-selector status.phase=Running -o json | ConvertFrom-Json).items
    [int]$PodsCount = $Pods.count

    if ( $PodsCount -ne $TotalNumOfChannels ) {
        Write-Error "Number of pods not equal to number of docs"
        return
     }

    $channel = 0;
    while($channel -ne $TotalNumOfChannels){
            $SleepTime = Get-Random -Minimum 0 -Maximum 3
            sleep $SleepTime

            $PodName = $Pods[$channel].metadata.name
            $Command = "node ./server/publisher.js $channel $TotalRunTimePublisherInMinutes"

            Write-Output "Exec Command: $Command on Pod: $PodName"
            kubectl exec $PodName -n $PublisherNamespace -- bash -c $Command
            Write-Output "Exec Command DONE: on Pod: $PodName"

            Write-Output "Completed $channel"
        $channel++;
    }
}
